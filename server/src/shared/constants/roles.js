/**
 * Role name constants for RBAC.
 * These match the role names seeded in the database.
 * Used for admin checks in middleware and services.
 */
const ROLES = Object.freeze({
  ADMIN: 'Admin',
  PROJEKTLEITER: 'Projektleiter',
  TECHNIKER: 'Techniker',
  BUCHHALTER: 'Buchhalter',
  DISPONENT: 'Disponent',
  LEHRLING: 'Lehrling',
});

/**
 * Permission constants using module:action format.
 * Every protected endpoint requires one of these.
 */
const PERMISSIONS = Object.freeze({
  // Users
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_ADMIN: 'users:admin',

  // Roles
  ROLES_READ: 'roles:read',
  ROLES_ADMIN: 'roles:admin',

  // Audit
  AUDIT_READ: 'audit:read',

  // CRM
  CRM_READ: 'crm:read',
  CRM_WRITE: 'crm:write',
  CRM_DELETE: 'crm:delete',
  CRM_ADMIN: 'crm:admin',

  // Projects
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_ADMIN: 'projects:admin',

  // Projects — fine-grained (Phase C0)
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_READ: 'project:read',
  PROJECT_DELETE: 'project:delete',
  PROJECT_STATUS_UPDATE: 'project:status:update',
  PROJECT_STATUS_OVERRIDE: 'project:status:override',
  PROJECT_PREP_ACTIONS_MANAGE: 'project:prep-actions:manage',
  PROJECT_SCHEDULE_MANAGE: 'project:schedule:manage',
  PROJECT_DOCUMENTS_READ: 'project:documents:read',
  PROJECT_DOCUMENTS_WRITE: 'project:documents:write',
  PROJECT_DOCUMENTS_CREATE: 'project:documents:create',
  PROJECT_DOCUMENTS_DELETE: 'project:documents:delete',

  // Field Service
  FIELD_SERVICE_READ: 'field-service:read',
  FIELD_SERVICE_WRITE: 'field-service:write',
  FIELD_SERVICE_ADMIN: 'field-service:admin',

  // Scheduling
  SCHEDULING_READ: 'scheduling:read',
  SCHEDULING_WRITE: 'scheduling:write',
  SCHEDULING_ADMIN: 'scheduling:admin',

  // Quotations
  QUOTATIONS_READ: 'quotations:read',
  QUOTATIONS_WRITE: 'quotations:write',
  QUOTATIONS_DELETE: 'quotations:delete',
  QUOTATIONS_ADMIN: 'quotations:admin',

  // Invoicing
  INVOICING_READ: 'invoicing:read',
  INVOICING_WRITE: 'invoicing:write',
  INVOICING_DELETE: 'invoicing:delete',
  INVOICING_ADMIN: 'invoicing:admin',

  // Accounting
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

  // Reports
  REPORTS_READ: 'reports:read',
  REPORTS_WRITE: 'reports:write',

  // Time Tracking
  TIME_TRACKING_READ: 'time-tracking:read',
  TIME_TRACKING_WRITE: 'time-tracking:write',
  TIME_TRACKING_ADMIN: 'time-tracking:admin',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_ADMIN: 'settings:admin',

  // Files
  FILES_UPLOAD: 'files:upload',
  FILES_VIEW: 'files:view',
  FILES_DELETE: 'files:delete',
  FILES_LIST: 'files:list',

  // Tasks
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ADMIN: 'tasks:admin',

  // Notifications
  NOTIFICATIONS_READ: 'notifications:read',
  NOTIFICATIONS_WRITE: 'notifications:write',

  // System
  SYSTEM_CONFIG_VIEW: 'system:config:view',
  SYSTEM_JOBS_VIEW: 'system:jobs:view',
  SYSTEM_JOBS_MANAGE: 'system:jobs:manage',
  SYSTEM_CACHE_MANAGE: 'system:cache:manage',
  SYSTEM_EVENTS_VIEW: 'system:events:view',
  SYSTEM_EVENTS_MANAGE: 'system:events:manage',
});

export { ROLES, PERMISSIONS };
export default ROLES;
