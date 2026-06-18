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
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_WRITE: 'documents:write',
  DOCUMENTS_DELETE: 'documents:delete',
  TEMPLATES_READ: 'templates:read',
  TEMPLATES_WRITE: 'templates:write',
  TEMPLATES_DELETE: 'templates:delete',
  TEMPLATES_ADMIN: 'templates:admin',

  // Accounting (future)
  ACCOUNTING_READ: 'accounting:read',
  ACCOUNTING_WRITE: 'accounting:write',
  ACCOUNTING_ADMIN: 'accounting:admin',
  ACCOUNTING_CHART_READ: 'accounting:chart:read',
  ACCOUNTING_CHART_MANAGE: 'accounting:chart:manage',
  ACCOUNTING_JOURNAL_READ: 'accounting:journal:read',
  ACCOUNTING_JOURNAL_WRITE: 'accounting:journal:write',
  ACCOUNTING_JOURNAL_EXPORT: 'accounting:journal:export',
  ACCOUNTING_AR_READ: 'accounting:ar:read',
  ACCOUNTING_AR_MANAGE: 'accounting:ar:manage',
  ACCOUNTING_AR_DUNNING: 'accounting:ar:dunning',
  ACCOUNTING_AP_READ: 'accounting:ap:read',
  ACCOUNTING_AP_MANAGE: 'accounting:ap:manage',
  ACCOUNTING_AP_APPROVE: 'accounting:ap:approve',
  ACCOUNTING_AP_APPROVE_HIGH: 'accounting:ap:approve_high',
  ACCOUNTING_AP_UPLOAD: 'accounting:ap:upload',
  ACCOUNTING_DOCUMENTS_READ: 'accounting:documents:read',
  ACCOUNTING_DOCUMENTS_MANAGE: 'accounting:documents:manage',
  ACCOUNTING_BANK_READ: 'accounting:bank:read',
  ACCOUNTING_BANK_MANAGE: 'accounting:bank:manage',
  ACCOUNTING_RECONCILIATION_MANAGE: 'accounting:reconciliation:manage',
  ACCOUNTING_CASH_READ: 'accounting:cash:read',
  ACCOUNTING_CASH_MANAGE: 'accounting:cash:manage',
  ACCOUNTING_OPENITEMS_READ: 'accounting:openitems:read',
  ACCOUNTING_OPENITEMS_MANAGE: 'accounting:openitems:manage',

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
  NOTIFICATIONS_WRITE: 'notifications:write',
  NOTIFICATIONS_FEED: 'notifications:feed',
  NOTIFICATIONS_PREFERENCES: 'notifications:preferences',
  NOTIFICATIONS_DISPATCH: 'notifications:dispatch',
  NOTIFICATIONS_TEMPLATES_MANAGE: 'notifications:templates:manage',
  NOTIFICATIONS_SCHEDULED_MANAGE: 'notifications:scheduled:manage',
  NOTIFICATIONS_METRICS_READ: 'notifications:metrics:read',
  NOTIFICATIONS_ADMIN: 'notifications:admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
