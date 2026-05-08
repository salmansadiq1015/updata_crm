/**
 * All permission keys used in the application.
 * These match the permission strings defined in the backend role system.
 */
export const PERMISSIONS = {
  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_DELETE: 'users:delete',
  USERS_ADMIN: 'users:admin',

  // Roles
  ROLES_READ: 'roles:read',
  ROLES_WRITE: 'roles:write',
  ROLES_DELETE: 'roles:delete',
  ROLES_ADMIN: 'roles:admin',

  // Audit
  AUDIT_READ: 'audit:read',

  // Sessions
  SESSIONS_READ: 'sessions:read',
  SESSIONS_ADMIN: 'sessions:admin',

  // System
  SYSTEM_READ: 'system:read',
  SYSTEM_ADMIN: 'system:admin',

  // CRM
  CRM_READ: 'crm:read',
  CRM_WRITE: 'crm:write',
  CRM_DELETE: 'crm:delete',
  CRM_ADMIN: 'crm:admin',

  // Projects (future)
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  PROJECTS_DELETE: 'projects:delete',

  // Scheduling (future)
  SCHEDULING_READ: 'scheduling:read',
  SCHEDULING_WRITE: 'scheduling:write',

  // Quotations (future)
  QOP_READ: 'qop:read',
  QOP_WRITE: 'qop:write',
  QOP_DELETE: 'qop:delete',

  // Accounting (future)
  ACCOUNTING_READ: 'accounting:read',
  ACCOUNTING_WRITE: 'accounting:write',

  // Tasks (future)
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',

  // Catalog
  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',
  CATALOG_DELETE: 'catalog:delete',
  CATALOG_PRICE: 'catalog:price',
  CATALOG_ADMIN: 'catalog:admin',

  // Notifications (future)
  NOTIFICATIONS_READ: 'notifications:read',
  NOTIFICATIONS_ADMIN: 'notifications:admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
