# Module 02 -- Authentication & User Management: Technical Design

---

## 1. API Design

### 1.1 Authentication Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/api/v1/auth/login` | Authenticate and receive tokens | No |
| POST | `/api/v1/auth/refresh` | Refresh access token | No (refresh token in body) |
| POST | `/api/v1/auth/logout` | Invalidate refresh token | Yes |
| POST | `/api/v1/auth/reset-password/request` | Request a password reset email | No |
| POST | `/api/v1/auth/reset-password/confirm` | Set new password with token | No |
| POST | `/api/v1/auth/change-password` | Change own password (authenticated) | Yes |

### 1.2 User Management Endpoints

| Method | Path | Description | Auth Required | Permission |
|--------|------|-------------|---------------|------------|
| GET | `/api/v1/users` | List users (paginated, filterable) | Yes | `users:read` |
| POST | `/api/v1/users` | Create a new user | Yes | `users:write` |
| GET | `/api/v1/users/:id` | Get user by ID | Yes | `users:read` or own profile |
| PATCH | `/api/v1/users/:id` | Update user | Yes | `users:write` or own profile (limited) |
| DELETE | `/api/v1/users/:id` | Deactivate user (soft delete) | Yes | `users:admin` |
| GET | `/api/v1/users/me` | Get current user profile | Yes | Any |
| PATCH | `/api/v1/users/me` | Update own profile | Yes | Any |
| POST | `/api/v1/users/:id/avatar` | Upload user avatar | Yes | `users:write` or own |
| DELETE | `/api/v1/users/:id/avatar` | Remove user avatar | Yes | `users:write` or own |

### 1.3 Role & Permission Endpoints

| Method | Path | Description | Auth Required | Permission |
|--------|------|-------------|---------------|------------|
| GET | `/api/v1/roles` | List all roles | Yes | `roles:read` |
| POST | `/api/v1/roles` | Create a custom role | Yes | `roles:admin` |
| GET | `/api/v1/roles/:id` | Get role with permissions | Yes | `roles:read` |
| PATCH | `/api/v1/roles/:id` | Update role permissions | Yes | `roles:admin` |
| DELETE | `/api/v1/roles/:id` | Delete role (if no users assigned) | Yes | `roles:admin` |
| GET | `/api/v1/permissions` | List all permissions (grouped by module) | Yes | `roles:read` |

### 1.4 Session Management Endpoints

| Method | Path | Description | Auth Required | Permission |
|--------|------|-------------|---------------|------------|
| GET | `/api/v1/auth/sessions` | List own active sessions | Yes | Any |
| DELETE | `/api/v1/auth/sessions/:id` | Revoke a specific session | Yes | Any (own) or `users:admin` |
| POST | `/api/v1/auth/sessions/revoke-others` | Revoke all sessions except current | Yes | Any |
| GET | `/api/v1/users/:id/sessions` | List sessions for a specific user | Yes | `users:admin` |
| DELETE | `/api/v1/users/:id/sessions` | Revoke all sessions for a user | Yes | `users:admin` |

### 1.5 Audit Log Endpoints

| Method | Path | Description | Auth Required | Permission |
|--------|------|-------------|---------------|------------|
| GET | `/api/v1/auth/audit` | Query audit log (paginated, filterable) | Yes | `audit:read` |
| GET | `/api/v1/auth/audit/export` | Export audit log as CSV or JSON | Yes | `audit:read` |

### 1.6 Request/Response Examples

**Login Request:**
```json
POST /api/v1/auth/login
{
  "email": "hans.muster@mbboiler.ch",
  "password": "SecureP@ss123!"
}
```

**Login Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
    "expiresIn": 900,
    "tokenType": "Bearer",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "hans.muster@mbboiler.ch",
      "firstName": "Hans",
      "lastName": "Muster",
      "role": {
        "id": "role-001",
        "name": "Techniker"
      },
      "language": "de",
      "status": "active"
    }
  }
}
```

**Login Error (401):**
```json
{
  "success": false,
  "error": {
    "statusCode": 401,
    "error": "Unauthorized",
    "message": "Ungueltige Anmeldedaten.",
    "code": "INVALID_CREDENTIALS"
  }
}
```

**Create User Request:**
```json
POST /api/v1/users
{
  "email": "anna.mueller@mbboiler.ch",
  "firstName": "Anna",
  "lastName": "Mueller",
  "roleId": "role-002",
  "language": "de",
  "phone": "+41 79 123 45 67"
}
```

---

## 2. Data Models

### 2.1 Users

Table: `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique user ID |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login email address |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt/Argon2id hash |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| phone | VARCHAR(30) | NULL | Phone number |
| language | VARCHAR(5) | NOT NULL, DEFAULT 'de' | Preferred language (de, en, fr, it) |
| avatar_file_id | UUID | FK -> file_metadata.id, NULL | Profile picture |
| role_id | UUID | FK -> roles.id, NOT NULL | Assigned role |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending_activation' | active, pending_activation, deactivated, locked |
| failed_login_attempts | SMALLINT | NOT NULL, DEFAULT 0 | Consecutive failed attempts |
| locked_until | TIMESTAMPTZ | NULL | Account lockout expiry |
| last_login_at | TIMESTAMPTZ | NULL | Last successful login |
| password_changed_at | TIMESTAMPTZ | NULL | Last password change |
| activation_token_hash | VARCHAR(255) | NULL | Hashed activation token |
| activation_token_expires | TIMESTAMPTZ | NULL | Activation token expiry |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update |

Indexes:
- `idx_users_email` on `(email)` UNIQUE
- `idx_users_role_id` on `(role_id)`
- `idx_users_status` on `(status)`

### 2.2 Roles

Table: `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique role ID |
| name | VARCHAR(50) | NOT NULL, UNIQUE | Role name (e.g., 'Admin', 'Techniker') |
| description | VARCHAR(255) | NULL | Human-readable description |
| is_system | BOOLEAN | NOT NULL, DEFAULT false | System-defined (cannot be deleted) |
| is_customized | BOOLEAN | NOT NULL, DEFAULT false | Modified from system default |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update |

### 2.3 Permissions

Table: `permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique permission ID |
| module | VARCHAR(50) | NOT NULL | Module name (e.g., 'crm', 'projects') |
| action | VARCHAR(20) | NOT NULL | Action (read, write, delete, admin) |
| description | VARCHAR(255) | NULL | Human-readable description |

Unique constraint: `(module, action)`

### 2.4 Role-Permission Mapping

Table: `role_permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| role_id | UUID | FK -> roles.id, NOT NULL | Role reference |
| permission_id | UUID | FK -> permissions.id, NOT NULL | Permission reference |

Primary key: `(role_id, permission_id)`

### 2.5 Password History

Table: `password_history`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Record ID |
| user_id | UUID | FK -> users.id, NOT NULL | User reference |
| password_hash | VARCHAR(255) | NOT NULL | Historical password hash |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When this password was set |

Index: `idx_password_history_user` on `(user_id, created_at DESC)`

### 2.6 Password Reset Tokens

Table: `password_reset_tokens`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Token record ID |
| user_id | UUID | FK -> users.id, NOT NULL | User reference |
| token_hash | VARCHAR(255) | NOT NULL | Hashed reset token |
| expires_at | TIMESTAMPTZ | NOT NULL | Token expiry |
| used_at | TIMESTAMPTZ | NULL | When the token was consumed |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |

Index: `idx_reset_tokens_user` on `(user_id, created_at DESC)`

### 2.7 Audit Log

Table: `auth_audit_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Audit record ID |
| timestamp | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event timestamp |
| event_type | VARCHAR(50) | NOT NULL | Event type (login.success, login.failed, etc.) |
| user_id | UUID | NULL | User involved (NULL for failed logins with unknown email) |
| email | VARCHAR(255) | NULL | Email used (for login attempts) |
| ip_address | INET | NOT NULL | Client IP address |
| user_agent | TEXT | NULL | Client user agent string |
| result | VARCHAR(20) | NOT NULL | 'success' or 'failure' |
| details | JSONB | NULL | Additional context |
| module | VARCHAR(50) | NOT NULL, DEFAULT 'auth' | Source module |

Indexes:
- `idx_audit_log_user` on `(user_id, timestamp DESC)`
- `idx_audit_log_type` on `(event_type, timestamp DESC)`
- `idx_audit_log_timestamp` on `(timestamp DESC)`

**Important:** This table has no UPDATE or DELETE permissions granted to the application role. Only INSERT and SELECT are permitted.

---

## 3. Session Storage (Redis)

### 3.1 Refresh Token Storage

```
Key:    session:{userId}:{sessionId}
Value:  JSON string
TTL:    604800 (7 days, configurable)
```

Value schema:
```json
{
  "refreshTokenHash": "sha256:abc123...",
  "userId": "550e8400-...",
  "deviceType": "web",
  "browser": "Chrome 120",
  "os": "Windows 10",
  "ipAddress": "192.168.1.100",
  "createdAt": "2026-03-29T10:00:00Z",
  "lastActiveAt": "2026-03-29T14:30:00Z"
}
```

### 3.2 Failed Login Tracking

```
Key:    auth:failed:{email}
Value:  Integer (count)
TTL:    900 (15 minutes)
```

### 3.3 Permission Cache

```
Key:    auth:permissions:{userId}
Value:  JSON array of permission strings
TTL:    300 (5 minutes)
```

Example:
```json
["crm:read", "crm:write", "projects:read", "field-service:read", "field-service:write"]
```

---

## 4. JWT Token Structure

### 4.1 Access Token Payload

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "hans.muster@mbboiler.ch",
  "role": "Techniker",
  "roleId": "role-003",
  "iat": 1711699200,
  "exp": 1711700100,
  "iss": "mb-boiler-api",
  "jti": "unique-token-id"
}
```

### 4.2 Token Configuration

| Parameter | Default | Configurable Via |
|-----------|---------|-----------------|
| Access token lifetime | 900s (15 min) | `JWT_ACCESS_TTL` |
| Refresh token lifetime | 604800s (7 days) | `JWT_REFRESH_TTL` |
| Signing algorithm | HS256 | `JWT_ALGORITHM` |
| Signing secret | -- | `JWT_SECRET` (required) |
| Issuer | `mb-boiler-api` | `JWT_ISSUER` |

---

## 5. Event Flows

### 5.1 Events Published by This Module

| Event Type | Payload | Trigger |
|------------|---------|---------|
| `auth.login.success` | `{ userId, email, ipAddress, deviceType }` | Successful login |
| `auth.login.failed` | `{ email, ipAddress, reason, attemptCount }` | Failed login attempt |
| `auth.logout` | `{ userId, sessionId }` | User logout |
| `auth.password_changed` | `{ userId }` | Password changed or reset |
| `auth.password_reset_requested` | `{ userId, email }` | Reset email sent |
| `auth.session.revoked` | `{ userId, sessionId, revokedBy }` | Session revoked |
| `auth.account.locked` | `{ userId, email, lockedUntil }` | Account locked due to failed attempts |
| `auth.account.unlocked` | `{ userId }` | Account unlocked (auto or manual) |
| `user.created` | `{ userId, email, roleId, createdBy }` | New user created |
| `user.updated` | `{ userId, changedFields }` | User profile updated |
| `user.deactivated` | `{ userId, deactivatedBy }` | User account deactivated |
| `user.role_changed` | `{ userId, oldRoleId, newRoleId, changedBy }` | User role changed |
| `role.created` | `{ roleId, name, permissions }` | New role defined |
| `role.updated` | `{ roleId, addedPermissions, removedPermissions }` | Role permissions changed |
| `role.deleted` | `{ roleId, name }` | Role deleted |

### 5.2 Events Consumed by This Module

| Event Type | Source | Handler Action |
|------------|--------|----------------|
| `system.started` | Core Platform | Verify auth tables exist, warm permission cache |

### 5.3 Login Flow Diagram

```
Client              Gateway          AuthController       UserService         Redis           AuditService
  |                    |                    |                   |                 |                  |
  |-- POST /login ---->|                    |                   |                 |                  |
  |                    |-- route ---------->|                   |                 |                  |
  |                    |                    |-- findByEmail --->|                 |                  |
  |                    |                    |<-- user ----------|                 |                  |
  |                    |                    |-- checkLockout -->|                 |                  |
  |                    |                    |-- verifyPassword->|                 |                  |
  |                    |                    |<-- valid ---------|                 |                  |
  |                    |                    |-- generateJWT     |                 |                  |
  |                    |                    |-- storeSession ---|---------------->|                  |
  |                    |                    |<-- stored --------|-----------------|                  |
  |                    |                    |-- auditLogin -----|-----------------|----------------->|
  |                    |                    |-- publishEvent    |                 |                  |
  |                    |<-- { tokens } -----|                   |                 |                  |
  |<-- 200 OK ---------|                    |                   |                 |                  |
```

### 5.4 Authorization Middleware Flow

```
Incoming Request
       |
       v
[Extract JWT from Authorization header]
       |
       v
[Validate JWT signature + expiry]
       |
  valid?--NO--> 401 Unauthorized
       |
      YES
       |
       v
[Extract userId from token]
       |
       v
[Load permissions from cache]
       |
  cache hit?--NO--> [Load from DB, cache result]
       |
      YES
       |
       v
[Check required permission for endpoint]
       |
  authorized?--NO--> 403 Forbidden
       |
      YES
       |
       v
[Attach user context to request]
       |
       v
[Continue to handler]
```

---

## 6. Integration Points

### 6.1 Dependencies

| Dependency | Module | Purpose |
|------------|--------|---------|
| API Gateway | Core Platform (01) | Request routing, middleware pipeline |
| Event Bus | Core Platform (01) | Publishing auth/user events |
| Database | Core Platform (01) | User, role, audit persistence |
| Redis Cache | Core Platform (01) | Session storage, permission cache, rate limiting |
| File Storage | Core Platform (01) | User avatar storage |
| Background Jobs | Core Platform (01) | Sending password reset emails |
| Logging | Core Platform (01) | Structured logging of auth events |

### 6.2 Consumers of This Module

Every other module depends on the authentication middleware provided by this module:

| Consumer Module | Integration |
|-----------------|-------------|
| CRM & Asset Management (03) | Auth middleware on all CRM endpoints |
| Project Management (04) | Auth middleware on all project endpoints |
| Field Service (05) | Auth middleware + mobile token validation |
| Quotations (08) | Auth middleware on quotation endpoints |
| Invoicing & Accounting (09) | Auth middleware on financial endpoints |
| All modules | `@RequirePermission()` decorator for authorization |

### 6.3 Middleware Export

This module exports the following middleware for use by other modules:

```typescript
// Authentication middleware - validates JWT, attaches user context
export const authenticate: Middleware;

// Authorization middleware factory - checks specific permission
export function requirePermission(permission: string): Middleware;

// Combined guard
export function authGuard(permission: string): Middleware[];

// User context type available to all handlers
export interface UserContext {
  userId: string;
  email: string;
  role: string;
  roleId: string;
  permissions: string[];
}
```

---

## 7. Security Considerations

- **Password hashing:** bcrypt with cost factor 12 (or Argon2id with memory=65536, iterations=3, parallelism=4).
- **Timing attacks:** Password verification uses constant-time comparison.
- **Token storage:** Refresh tokens are stored as SHA-256 hashes in Redis; the raw token is never persisted.
- **Reset token security:** Reset tokens are cryptographically random (32 bytes), stored as SHA-256 hashes, and single-use.
- **Rate limiting on auth endpoints:** `/auth/login` is limited to 10 requests per minute per IP. `/auth/reset-password/request` is limited to 3 per hour per IP.
- **Email enumeration prevention:** The reset-password endpoint always returns 200 regardless of email existence.
- **HTTPS only:** Authentication endpoints must only be accessible over HTTPS in production.
- **Sensitive header redaction:** `Authorization` and `Cookie` headers are redacted in logs.

---

## 8. Seed Data

The following data is seeded on first deployment:

### 8.1 Permissions

| Module | Actions |
|--------|---------|
| users | read, write, admin |
| roles | read, admin |
| audit | read |
| crm | read, write, delete, admin |
| projects | read, write, delete, admin |
| field-service | read, write, admin |
| scheduling | read, write, admin |
| quotations | read, write, delete, admin |
| invoicing | read, write, delete, admin |
| accounting | read, write, admin |
| reports | read, write |
| time-tracking | read, write, admin |
| settings | read, admin |

### 8.2 Default Roles and Permissions

| Role | Permissions |
|------|-------------|
| Admin | All permissions |
| Projektleiter | crm:*, projects:*, quotations:*, scheduling:*, field-service:read, reports:*, time-tracking:read |
| Techniker | crm:read, field-service:read, field-service:write, time-tracking:read, time-tracking:write |
| Buchhalter | crm:read, invoicing:*, accounting:*, reports:*, quotations:read |
| Disponent | crm:read, scheduling:*, field-service:read, time-tracking:read |
| Lehrling | field-service:read, time-tracking:read, time-tracking:write |

### 8.3 Initial Admin User

An initial admin user is created from environment variables:
- `ADMIN_EMAIL` (required on first boot)
- `ADMIN_FIRST_NAME` (default: "System")
- `ADMIN_LAST_NAME` (default: "Administrator")
- `ADMIN_PASSWORD` (required on first boot)
