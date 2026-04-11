# Module 02 -- Authentication & User Management

## 1. Purpose

This module provides identity management, authentication, authorization, and role-based access control (RBAC) for the MB Boiler & Heizung AG platform. It is the security gatekeeper through which every user interaction passes before reaching any business module.

## 2. Source Requirement

Section 12 of the Statement of Work -- "Users and role management."

## 3. Scope

| In Scope | Out of Scope |
|----------|--------------|
| User CRUD (create, read, update, deactivate) | Business-domain user profiles (e.g., technician skills, certifications) |
| Role definitions and permission matrices | Module-specific business logic |
| Module-level and feature-level access control | UI component rendering decisions (handled by frontend) |
| Session management (JWT access + refresh tokens) | External SSO / OAuth provider integration (future phase) |
| Password policies and secure reset flow | Two-factor authentication (future phase) |
| Audit trail of authentication and access events | |
| Multi-device session support | |

## 4. Responsibilities

- Managing the full lifecycle of user accounts: creation, update, deactivation, and deletion.
- Defining roles with granular permissions mapped to modules, features, and actions (read/write/delete/admin).
- Issuing, validating, and refreshing JWT tokens for stateless authentication.
- Enforcing password complexity, expiration, and history policies.
- Providing a secure password reset flow (email-based token).
- Recording an immutable audit trail of all authentication and authorization events.
- Supporting concurrent sessions across multiple devices (web + mobile).

## 5. Key Features

| ID | Feature | Priority |
|----|---------|----------|
| AUTH-001 | User Registration & Management | H |
| AUTH-002 | Role Definition & Assignment | H |
| AUTH-003 | Module-Level Access Control | H |
| AUTH-004 | Session Management & JWT | H |
| AUTH-005 | Password Policy & Reset | M |
| AUTH-006 | Audit Trail for Access Events | M |
| AUTH-007 | Multi-Device Session Support | M |

## 6. Predefined Roles (Initial)

Based on SOW Section 12, the following roles are defined at launch:

| Role | Description | Typical Permissions |
|------|-------------|---------------------|
| **Admin** | Full system access, user management | All modules: full CRUD + admin |
| **Projektleiter** (Project Manager) | Manages projects, quotations, schedules | Projects, CRM, Quotations, Scheduling: full CRUD |
| **Techniker** (Technician) | Field operations, time tracking, reports | Field Service, Time Tracking, CRM (read): write |
| **Buchhalter** (Accountant) | Financial operations | Invoicing, Accounting, Reports: full CRUD |
| **Disponent** (Dispatcher) | Scheduling and resource planning | Scheduling, CRM (read), Field Service (read): write |
| **Lehrling** (Apprentice) | Limited field access, supervised | Field Service (limited), Time Tracking: write |
| **Kunde** (Customer) | External portal access (future) | Customer Portal: read own data |

## 7. Module Boundaries

```
+---------------------------------------------+
|     Authentication & Users (02)             |
|  +---------+  +----------+  +------------+  |
|  |  Users  |  |  Roles   |  | Permissions|  |
|  +---------+  +----------+  +------------+  |
|  +---------+  +----------+  +------------+  |
|  |  JWT    |  | Sessions |  | Audit Log  |  |
|  +---------+  +----------+  +------------+  |
+---------------------------------------------+
        ^               ^               ^
        |               |               |
   Core Platform    All Modules     Admin UI
      (01)          (03-12+)
```

- **Upstream dependency:** Core Platform (01) -- uses API gateway, event bus, logging, database, caching.
- **Downstream consumers:** Every business module calls the auth middleware to verify tokens and check permissions.

## 8. Key Constraints

- Passwords must be hashed using bcrypt (cost factor >= 12) or Argon2id.
- JWT access tokens must have a short lifetime (default: 15 minutes).
- Refresh tokens must be stored server-side (Redis or database) and are revocable.
- All authentication events (login, logout, failed attempt, password change) must be logged immutably.
- Account lockout must activate after a configurable number of failed login attempts (default: 5 within 15 minutes).
- The module must support the Swiss German locale for error messages and UI labels.

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Authentication latency (login endpoint p95) | < 500 ms |
| Token validation latency (middleware p99) | < 5 ms |
| Failed login detection and lockout | Within 1 second of threshold breach |
| Audit log write success rate | 100 % (no lost events) |
| Password reset email delivery | < 30 seconds from request |
