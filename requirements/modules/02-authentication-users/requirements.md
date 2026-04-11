# Module 02 -- Authentication & User Management: Detailed Requirements

---

## AUTH-001: User Registration & Management

| Field | Value |
|-------|-------|
| **ID** | AUTH-001 |
| **Title** | User Registration & Management |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-001 (API Gateway), CORE-005 (DB Migrations), CORE-006 (File Storage for avatars) |
| **Tags** | `auth`, `users`, `crud`, `management`, `identity` |

### Description

The system shall allow administrators to create, read, update, and deactivate user accounts. Each user has a unique email address, a display name, an assigned role, and optional profile information. Users cannot self-register; all accounts are created by an administrator. Deactivated users cannot log in but their data is retained for audit purposes.

### Actors

- **Admin** -- creates and manages user accounts.
- **User** -- views and edits own profile (limited fields).
- **System** -- enforces uniqueness and validation rules.

### Preconditions

1. The requesting user has the `users:write` permission (admin role).
2. The database is available and the users table exists.

### Flow

**Main Flow -- Create User:**

1. Admin submits a POST request with user details: email, firstName, lastName, role, language preference.
2. The system validates the email format and uniqueness.
3. The system generates a temporary password or a setup-link token.
4. The system creates the user record with status `pending_activation`.
5. The system sends an activation email with the setup link.
6. The system publishes a `user.created` event.
7. The system returns the created user (without password).

**Main Flow -- Update User:**

1. Admin or the user themselves submits a PATCH request with changed fields.
2. The system validates permissions (admin can edit all fields; user can edit own name, language, avatar).
3. The system updates the record and publishes `user.updated`.

**Main Flow -- Deactivate User:**

1. Admin submits a PATCH request setting `status` to `deactivated`.
2. The system invalidates all active sessions/tokens for the user.
3. The system publishes `user.deactivated`.

**Alternate Flows:**

- **A1 -- Duplicate email:** System returns HTTP 409 Conflict.
- **A2 -- User edits restricted field:** System returns HTTP 403 Forbidden.
- **A3 -- Deactivate last admin:** System returns HTTP 422 with error "Cannot deactivate the last admin user."

### Postconditions

- The user record is created/updated/deactivated in the database.
- Relevant domain events have been published.
- For deactivation: all sessions for the user are invalidated.

### Acceptance Criteria

- [ ] Admins can create users with: email (required, unique), firstName (required), lastName (required), role (required), language (optional, default 'de'), phone (optional).
- [ ] Email uniqueness is enforced at the database level (unique constraint).
- [ ] New users receive an activation email with a time-limited setup link (valid for 48 hours).
- [ ] Users can update their own profile: firstName, lastName, language, phone, avatar.
- [ ] Admins can update any user field including role and status.
- [ ] Deactivated users cannot authenticate (login returns HTTP 401 with "Account deactivated" message).
- [ ] Deactivated users' data is retained (soft delete); the record is never physically removed.
- [ ] The last remaining admin user cannot be deactivated or have their role changed.
- [ ] User list supports pagination, search (by name/email), and filtering (by role, status).
- [ ] A `user.created`, `user.updated`, or `user.deactivated` event is published for each respective action.

---

## AUTH-002: Role Definition & Assignment

| Field | Value |
|-------|-------|
| **ID** | AUTH-002 |
| **Title** | Role Definition & Assignment |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | AUTH-001, CORE-002 (Event Bus) |
| **Tags** | `auth`, `roles`, `permissions`, `rbac`, `access-control` |

### Description

The system shall support a role-based access control model where permissions are grouped into roles, and roles are assigned to users. Permissions are defined as module-action pairs (e.g., `crm:read`, `crm:write`, `projects:admin`). The system ships with predefined roles but allows administrators to create custom roles.

### Actors

- **Admin** -- defines roles, assigns permissions, assigns roles to users.
- **System** -- enforces permission checks on every request.

### Preconditions

1. The requesting user has the `roles:admin` permission.
2. The predefined roles have been seeded by the database migration.

### Flow

**Main Flow -- Create Custom Role:**

1. Admin submits a POST request with role name, description, and a list of permission IDs.
2. The system validates that all permission IDs exist.
3. The system creates the role record and links permissions.
4. The system publishes `role.created`.

**Main Flow -- Assign Role to User:**

1. Admin submits a PATCH to `/users/:id` with `roleId`.
2. The system updates the user's role.
3. The system invalidates the user's cached permission set.
4. The system publishes `user.role_changed`.

**Alternate Flows:**

- **A1 -- Duplicate role name:** System returns HTTP 409 Conflict.
- **A2 -- Delete role with assigned users:** System returns HTTP 422 with error "Role is assigned to N users. Reassign them first."
- **A3 -- Modify predefined role:** Allowed, but the role is flagged as `customized: true` for audit purposes.

### Postconditions

- The role exists with its permission set.
- All users with the modified role have their cached permissions invalidated.

### Acceptance Criteria

- [ ] Predefined roles are seeded on first deployment: Admin, Projektleiter, Techniker, Buchhalter, Disponent, Lehrling.
- [ ] Each role has a name (unique), description, and a set of permissions.
- [ ] Permissions follow the pattern: `<module>:<action>` where action is one of `read`, `write`, `delete`, `admin`.
- [ ] Admins can create custom roles with any combination of existing permissions.
- [ ] Admins can modify role permissions (add/remove).
- [ ] Admins can assign exactly one role to a user.
- [ ] Changing a user's role takes effect immediately (cached permissions are invalidated).
- [ ] Roles cannot be deleted if users are assigned to them.
- [ ] A permissions list endpoint returns all available permissions grouped by module.
- [ ] The `role.created`, `role.updated`, `role.deleted`, and `user.role_changed` events are published.

---

## AUTH-003: Module-Level Access Control

| Field | Value |
|-------|-------|
| **ID** | AUTH-003 |
| **Title** | Module-Level Access Control |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | AUTH-002, AUTH-004, CORE-001, CORE-008 (Cache) |
| **Tags** | `auth`, `authorization`, `middleware`, `guard`, `access-control` |

### Description

The system shall enforce access control at the API gateway level using an authorization middleware (guard). Every incoming authenticated request is checked against the user's role permissions before the request reaches the module handler. The permission check must be fast (< 5 ms) by leveraging cached permission sets.

### Actors

- **System** -- enforces permissions on every request.
- **Admin** -- configures role-permission mappings (via AUTH-002).

### Preconditions

1. The user is authenticated (valid JWT, AUTH-004).
2. The user's role and permissions are loaded (from cache or database).

### Flow

**Main Flow:**

1. A request arrives at the API gateway with a valid JWT.
2. The auth middleware extracts the user ID from the token.
3. The middleware loads the user's permission set from cache (or database on cache miss).
4. The middleware checks if the required permission for the endpoint (e.g., `crm:write`) is in the user's permission set.
5. If authorized, the request proceeds to the module handler with user context attached.
6. If not authorized, the middleware returns HTTP 403 Forbidden.

**Alternate Flows:**

- **A1 -- Cache miss:** Permissions are loaded from the database and cached with TTL (default: 5 minutes).
- **A2 -- User deactivated between token issuance and request:** The middleware checks user status; if deactivated, returns HTTP 401.
- **A3 -- Public endpoint:** Certain endpoints (health, docs, login) bypass the auth middleware.

### Postconditions

- Authorized requests proceed with user context (userId, role, permissions) attached.
- Unauthorized requests are rejected with HTTP 403.

### Acceptance Criteria

- [ ] Every API endpoint (except explicitly public ones) requires authentication and authorization.
- [ ] Permission requirements are declared per endpoint (e.g., via decorator: `@RequirePermission('crm:write')`).
- [ ] The authorization check completes in < 5 ms (p99) using cached permissions.
- [ ] Users without the required permission receive HTTP 403 with message "Insufficient permissions."
- [ ] The user context (userId, role, permissions) is available to all downstream handlers.
- [ ] Public endpoints (`/health/*`, `/api/docs`, `/auth/login`, `/auth/refresh`, `/auth/reset-password`) bypass authorization.
- [ ] Permission changes take effect within the cache TTL window (default: 5 minutes) or immediately on cache invalidation.

---

## AUTH-004: Session Management & JWT

| Field | Value |
|-------|-------|
| **ID** | AUTH-004 |
| **Title** | Session Management & JWT |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | AUTH-001, CORE-004 (Config), CORE-008 (Redis) |
| **Tags** | `auth`, `jwt`, `session`, `tokens`, `security` |

### Description

The system shall use JWT (JSON Web Tokens) for stateless authentication. An access token (short-lived) and a refresh token (long-lived, stored server-side) are issued upon successful login. The access token is sent in the `Authorization: Bearer` header. Refresh tokens are stored in Redis and are individually revocable.

### Actors

- **User** -- authenticates by providing credentials.
- **System** -- issues, validates, and revokes tokens.
- **Admin** -- can revoke sessions for any user.

### Preconditions

1. The user account exists and is active.
2. The JWT signing secret is configured.

### Flow

**Main Flow -- Login:**

1. User sends POST `/auth/login` with `{ email, password }`.
2. The system looks up the user by email.
3. The system verifies the password hash.
4. If valid, the system generates an access token (JWT, 15 min TTL) and a refresh token (opaque, 7 day TTL).
5. The refresh token is stored in Redis with the user ID, device info, and expiration.
6. The system returns `{ accessToken, refreshToken, expiresIn, user }`.
7. The system publishes `auth.login.success` event.

**Main Flow -- Refresh:**

1. Client sends POST `/auth/refresh` with `{ refreshToken }`.
2. The system validates the refresh token against Redis.
3. If valid, the system issues a new access token and optionally rotates the refresh token.
4. The system returns the new tokens.

**Main Flow -- Logout:**

1. Client sends POST `/auth/logout` with `{ refreshToken }`.
2. The system removes the refresh token from Redis.
3. The system publishes `auth.logout` event.

**Alternate Flows:**

- **A1 -- Invalid credentials:** System returns HTTP 401. Increments failed attempt counter. Publishes `auth.login.failed`.
- **A2 -- Account locked:** System returns HTTP 423 Locked with message and lockout remaining time.
- **A3 -- Expired refresh token:** System returns HTTP 401 with `token_expired` error code.
- **A4 -- Admin revokes all sessions:** All refresh tokens for the user are deleted from Redis.

### Postconditions

- On login: tokens are issued, session is recorded.
- On logout: refresh token is removed, session is ended.
- On revocation: all sessions for the user are terminated.

### Acceptance Criteria

- [ ] Access tokens are JWTs signed with HS256 or RS256, containing: `sub` (user ID), `role`, `iat`, `exp`.
- [ ] Access token lifetime is configurable (default: 15 minutes).
- [ ] Refresh token lifetime is configurable (default: 7 days).
- [ ] Refresh tokens are stored in Redis and are individually revocable.
- [ ] Token refresh issues a new access token without requiring re-authentication.
- [ ] Refresh token rotation is supported (old token invalidated on use).
- [ ] Logout invalidates the specific refresh token.
- [ ] Admin can revoke all sessions for a user (bulk token deletion).
- [ ] The login response includes user profile data (id, name, email, role) alongside tokens.
- [ ] Failed login attempts are tracked; account is locked after 5 failures within 15 minutes.
- [ ] Locked accounts automatically unlock after the lockout period (default: 30 minutes).
- [ ] JWT validation rejects expired, malformed, and tampered tokens with appropriate error codes.

---

## AUTH-005: Password Policy & Reset

| Field | Value |
|-------|-------|
| **ID** | AUTH-005 |
| **Title** | Password Policy & Reset |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | AUTH-001, AUTH-004, CORE-007 (Background Jobs for email) |
| **Tags** | `auth`, `password`, `security`, `reset`, `policy` |

### Description

The system shall enforce configurable password policies (minimum length, complexity requirements, history) and provide a secure password reset flow via email. Password reset tokens are time-limited and single-use. Passwords are hashed using bcrypt or Argon2id and never stored in plaintext.

### Actors

- **User** -- sets password, requests reset.
- **Admin** -- configures password policies.
- **System** -- enforces policies, sends reset emails.

### Preconditions

1. For password reset: the user has a valid email address on file.
2. Email sending is configured and operational.

### Flow

**Main Flow -- Password Reset:**

1. User submits POST `/auth/reset-password/request` with `{ email }`.
2. The system looks up the user by email.
3. If the user exists, the system generates a cryptographically random reset token (valid for 1 hour).
4. The system stores the token hash in the database.
5. The system enqueues a background job to send the reset email.
6. The system returns HTTP 200 (regardless of whether the email exists, to prevent enumeration).

**Main Flow -- Set New Password:**

1. User submits POST `/auth/reset-password/confirm` with `{ token, newPassword }`.
2. The system validates the token (exists, not expired, not used).
3. The system validates the new password against the policy.
4. The system hashes the new password and updates the user record.
5. The system marks the token as used.
6. The system invalidates all existing sessions for the user.
7. The system publishes `auth.password_changed` event.

**Alternate Flows:**

- **A1 -- Password does not meet policy:** System returns HTTP 422 with specific violations.
- **A2 -- Token expired or invalid:** System returns HTTP 400 with generic error "Invalid or expired token."
- **A3 -- Password in history:** System returns HTTP 422 "Password was used recently. Choose a different one."

### Postconditions

- The user's password is updated and all previous sessions are invalidated.
- The reset token is consumed and cannot be reused.

### Acceptance Criteria

- [ ] Password minimum length: 10 characters (configurable).
- [ ] Password must contain at least: 1 uppercase, 1 lowercase, 1 digit, 1 special character.
- [ ] Password history: the last 5 passwords cannot be reused.
- [ ] Passwords are hashed using bcrypt (cost factor >= 12) or Argon2id.
- [ ] Password reset tokens expire after 1 hour.
- [ ] Password reset tokens are single-use.
- [ ] The reset request endpoint does not reveal whether an email exists (always returns 200).
- [ ] A password change invalidates all existing sessions/refresh tokens.
- [ ] The password reset email contains a link to the frontend reset page with the token as a query parameter.
- [ ] Password change is logged in the audit trail (AUTH-006).

---

## AUTH-006: Audit Trail for Access Events

| Field | Value |
|-------|-------|
| **ID** | AUTH-006 |
| **Title** | Audit Trail for Access Events |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | AUTH-001, AUTH-004, CORE-002 (Event Bus), CORE-005 (DB) |
| **Tags** | `auth`, `audit`, `security`, `compliance`, `logging` |

### Description

The system shall maintain an immutable audit trail of all authentication and authorization events. This includes logins (success and failure), logouts, password changes, role changes, permission denials, and session revocations. The audit trail must be queryable by administrators and retained for a configurable period (default: 2 years).

### Actors

- **System** -- writes audit entries automatically.
- **Admin** -- queries and exports audit data.

### Preconditions

1. The audit log table exists in the database.
2. The event bus is operational for capturing events.

### Flow

**Main Flow:**

1. An authentication or authorization event occurs (login, logout, permission check failure, etc.).
2. The auth module publishes the event on the event bus.
3. The audit listener receives the event and writes an immutable record to the `audit_log` table.
4. The record includes: timestamp, event type, user ID, IP address, user agent, result (success/failure), and additional context.

**Alternate Flows:**

- **A1 -- Database write failure:** The event is logged to the application log at FATAL level and retried via the event bus retry mechanism.
- **A2 -- Audit log query:** Admin requests GET `/api/v1/auth/audit` with filters (userId, eventType, dateRange). The system returns paginated results.

### Postconditions

- An immutable audit record exists for the event.
- No audit events are lost (guaranteed by at-least-once delivery).

### Acceptance Criteria

- [ ] The following events are audited: `login.success`, `login.failed`, `logout`, `password.changed`, `password.reset_requested`, `role.changed`, `user.created`, `user.deactivated`, `session.revoked`, `permission.denied`.
- [ ] Each audit record contains: `id`, `timestamp`, `eventType`, `userId`, `ipAddress`, `userAgent`, `result` (success/failure), `details` (JSON), `module`.
- [ ] Audit records are immutable (no UPDATE or DELETE operations allowed on the table).
- [ ] Admins can query audit logs with filters: user, event type, date range, result.
- [ ] Audit log data is retained for a configurable period (default: 2 years).
- [ ] Audit log supports export to CSV/JSON.
- [ ] Failed audit log writes trigger a FATAL-level log entry and alert.

---

## AUTH-007: Multi-Device Session Support

| Field | Value |
|-------|-------|
| **ID** | AUTH-007 |
| **Title** | Multi-Device Session Support |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | AUTH-004, CORE-008 (Redis) |
| **Tags** | `auth`, `session`, `multi-device`, `mobile`, `web` |

### Description

The system shall support concurrent active sessions across multiple devices (e.g., web browser and mobile app). Each session is tracked independently with device metadata. Users can view their active sessions and revoke individual sessions. Administrators can view and revoke sessions for any user.

### Actors

- **User** -- views own sessions, revokes individual sessions.
- **Admin** -- views and revokes sessions for any user.
- **System** -- tracks sessions with device metadata.

### Preconditions

1. The user is authenticated.
2. Sessions are stored in Redis (AUTH-004).

### Flow

**Main Flow -- List Sessions:**

1. User sends GET `/auth/sessions`.
2. The system retrieves all active refresh tokens for the user from Redis.
3. The system returns a list of sessions with: device type, browser/app, IP address, last active timestamp, creation timestamp, and whether the session is the current one.

**Main Flow -- Revoke Session:**

1. User sends DELETE `/auth/sessions/:sessionId`.
2. The system validates the session belongs to the requesting user (or requestor is admin).
3. The system removes the refresh token from Redis.
4. The system publishes `auth.session.revoked`.

**Alternate Flows:**

- **A1 -- Revoke all other sessions:** User sends POST `/auth/sessions/revoke-others`. All sessions except the current one are removed.
- **A2 -- Maximum session limit reached:** If a user has more than the configured limit (default: 10), the oldest session is automatically revoked when a new login occurs.

### Postconditions

- The session is revoked and the corresponding refresh token is deleted.
- The user on the revoked device will need to re-authenticate on their next request.

### Acceptance Criteria

- [ ] Users can view a list of their active sessions with device metadata.
- [ ] Each session displays: device type (web/mobile/tablet), browser/app name, IP address, last activity timestamp, and login timestamp.
- [ ] Users can revoke individual sessions (except the current session via the single-revoke endpoint).
- [ ] Users can revoke all sessions except the current one.
- [ ] Admins can list and revoke sessions for any user.
- [ ] A maximum session limit is enforced (default: 10 concurrent sessions per user).
- [ ] When the session limit is reached, the oldest session is automatically revoked.
- [ ] Session metadata is captured from the `User-Agent` header and IP address at login time.
- [ ] Revoking a session immediately invalidates the refresh token; the access token remains valid until its natural expiration.
