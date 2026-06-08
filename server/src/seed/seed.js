import { seedCatalog } from './catalog-seed.js';
import Permission from '../modules/auth/permission.model.js';
import Role from '../modules/auth/role.model.js';
import User from '../modules/auth/user.model.js';
import PasswordHistory from '../modules/auth/passwordHistory.model.js';
import { hashPassword } from '../shared/utils/crypto.js';
import cacheManager from '../shared/cache/CacheManager.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Seed permissions, roles, and initial admin user.
 *
 * Idempotent: upserts permissions on every run so new entries added to
 * PERMISSION_DEFINITIONS are created in existing databases automatically.
 * Roles are created if missing; Admin role is always synced to all permissions.
 * Other roles receive new permissions via $addToSet (never removes existing ones).
 */

// All permission definitions: { module, action, description }
export const ACCOUNTING_PERMISSION_KEYS = [
  'accounting:read',
  'accounting:write',
  'accounting:admin',
  'accounting:chart:read',
  'accounting:chart:manage',
  'accounting:journal:read',
  'accounting:journal:write',
  'accounting:journal:export',
  'accounting:ar:read',
  'accounting:ar:manage',
  'accounting:ar:dunning',
  'accounting:ap:read',
  'accounting:ap:manage',
  'accounting:ap:approve',
  'accounting:ap:approve_high',
  'accounting:ap:upload',
  'accounting:documents:read',
  'accounting:documents:manage',
  'accounting:bank:read',
  'accounting:bank:manage',
  'accounting:reconciliation:manage',
  'accounting:cash:read',
  'accounting:cash:manage',
  'accounting:openitems:read',
  'accounting:openitems:manage',
];

const accountingPermissionDefinitions = ACCOUNTING_PERMISSION_KEYS.map((key) => {
  const [module, ...actionParts] = key.split(':');
  return {
    module,
    action: actionParts.join(':'),
    description: `Accounting permission: ${key}`,
  };
});

export const PERMISSION_DEFINITIONS = [
  // Users
  { module: 'users', action: 'read', description: 'View user profiles' },
  { module: 'users', action: 'write', description: 'Create and update users' },
  { module: 'users', action: 'admin', description: 'Full user administration' },

  // Roles
  { module: 'roles', action: 'read', description: 'View roles and permissions' },
  { module: 'roles', action: 'admin', description: 'Manage roles and permissions' },

  // Audit
  { module: 'audit', action: 'read', description: 'View audit logs' },

  // CRM
  { module: 'crm', action: 'read', description: 'View CRM data' },
  { module: 'crm', action: 'write', description: 'Create and update CRM data' },
  { module: 'crm', action: 'delete', description: 'Delete CRM data' },
  { module: 'crm', action: 'admin', description: 'Full CRM administration' },

  // Projects
  { module: 'projects', action: 'read', description: 'View projects' },
  { module: 'projects', action: 'write', description: 'Create and update projects' },
  { module: 'projects', action: 'delete', description: 'Delete projects' },
  { module: 'projects', action: 'admin', description: 'Full project administration' },

  // Projects — fine-grained (Phase C0)
  { module: 'project', action: 'create',              description: 'Create new projects' },
  { module: 'project', action: 'edit',                description: 'Edit project details' },
  { module: 'project', action: 'read',                description: 'View project details' },
  { module: 'project', action: 'delete',              description: 'Delete / soft-delete projects' },
  { module: 'project', action: 'status:update',       description: 'Transition project status through allowed flow' },
  { module: 'project', action: 'status:override',     description: 'Override project status transition rules' },
  { module: 'project', action: 'prep-actions:manage', description: 'Create, update, and delete preparatory actions' },
  { module: 'project', action: 'schedule:manage',     description: 'Create, update, and delete schedule entries' },
  { module: 'project', action: 'documents:read',      description: 'View project documents' },
  { module: 'project', action: 'documents:write',     description: 'Upload and update project documents' },
  { module: 'project', action: 'documents:create',    description: 'Generate project documents from templates' },
  { module: 'project', action: 'documents:delete',    description: 'Delete project documents' },

  // Field Service
  { module: 'field-service', action: 'read', description: 'View field service data' },
  { module: 'field-service', action: 'write', description: 'Create and update field service data' },
  { module: 'field-service', action: 'admin', description: 'Full field service administration' },

  // Scheduling
  { module: 'scheduling', action: 'read', description: 'View schedules' },
  { module: 'scheduling', action: 'write', description: 'Create and update schedules' },
  { module: 'scheduling', action: 'admin', description: 'Full scheduling administration' },

  // Quotations
  { module: 'quotations', action: 'read', description: 'View quotations' },
  { module: 'quotations', action: 'write', description: 'Create and update quotations' },
  { module: 'quotations', action: 'delete', description: 'Delete quotations' },
  { module: 'quotations', action: 'admin', description: 'Full quotation administration' },

  // Invoicing
  { module: 'invoicing', action: 'read', description: 'View invoices' },
  { module: 'invoicing', action: 'write', description: 'Create and update invoices' },
  { module: 'invoicing', action: 'delete', description: 'Delete invoices' },
  { module: 'invoicing', action: 'admin', description: 'Full invoice administration' },

  // Accounting
  ...accountingPermissionDefinitions,

  // Reports
  { module: 'reports', action: 'read', description: 'View reports' },
  { module: 'reports', action: 'write', description: 'Create and manage reports' },

  // Tasks
  { module: 'tasks', action: 'read', description: 'View tasks' },
  { module: 'tasks', action: 'write', description: 'Create and update tasks' },
  { module: 'tasks', action: 'delete', description: 'Delete tasks' },
  { module: 'tasks', action: 'admin', description: 'Full task administration' },

  // Catalog
  { module: 'catalog', action: 'read', description: 'View catalog articles and categories' },
  { module: 'catalog', action: 'write', description: 'Create and update catalog articles and categories' },
  { module: 'catalog', action: 'delete', description: 'Soft-delete catalog articles' },
  { module: 'catalog', action: 'price', description: 'Update article prices and manage price batches' },
  { module: 'catalog', action: 'admin', description: 'Full catalog administration — IGH import, bulk import, UoM management' },

  // Notifications
  { module: 'notifications', action: 'read', description: 'View notifications' },
  { module: 'notifications', action: 'write', description: 'Send and manage notifications' },

  // AI Assistant
  { module: 'ai', action: 'sessions', description: 'Use AI voice sessions' },
  { module: 'ai', action: 'commands:manage', description: 'Manage AI voice commands' },
  { module: 'ai', action: 'vocabulary:manage', description: 'Manage AI custom vocabulary' },
  { module: 'ai', action: 'analytics:read', description: 'View AI assistant analytics' },

  // Time Tracking
  { module: 'time-tracking', action: 'read', description: 'View time entries' },
  { module: 'time-tracking', action: 'write', description: 'Create and update time entries' },
  { module: 'time-tracking', action: 'admin', description: 'Full time tracking administration' },

  // Settings
  { module: 'settings', action: 'read', description: 'View system settings' },
  { module: 'settings', action: 'admin', description: 'Manage system settings' },
];

// Role definitions with permission keys
export const ROLE_DEFINITIONS = [
  {
    name: 'Admin',
    description: 'Full system access, user management',
    permissionKeys: '*', // Always synced to all permissions
  },
  {
    name: 'Projektleiter',
    description: 'Manages projects, quotations, schedules',
    permissionKeys: [
      'crm:read', 'crm:write', 'crm:delete', 'crm:admin',
      'projects:read', 'projects:write', 'projects:delete', 'projects:admin',
      'project:create', 'project:edit', 'project:read', 'project:delete',
      'project:status:update', 'project:status:override',
      'project:prep-actions:manage', 'project:schedule:manage',
      'project:documents:read', 'project:documents:write',
      'project:documents:create', 'project:documents:delete',
      'quotations:read', 'quotations:write', 'quotations:delete', 'quotations:admin',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'field-service:read',
      'tasks:read', 'tasks:write', 'tasks:delete', 'tasks:admin',
      'notifications:read', 'notifications:write',
      'ai:sessions',
      'reports:read', 'reports:write',
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Techniker',
    description: 'Field operations, time tracking',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:documents:read',
      'field-service:read', 'field-service:write', 'field-service:admin',
      'tasks:read', 'tasks:write',
      'notifications:read',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write', 'time-tracking:admin',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Buchhalter',
    description: 'Financial operations',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:documents:read',
      'invoicing:read', 'invoicing:write', 'invoicing:delete', 'invoicing:admin',
      ...ACCOUNTING_PERMISSION_KEYS,
      'reports:read', 'reports:write',
      'quotations:read',
      'tasks:read',
      'notifications:read',
      'ai:sessions',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Disponent',
    description: 'Scheduling and resource planning',
    permissionKeys: [
      'crm:read',
      'project:read', 'project:schedule:manage', 'project:documents:read',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'field-service:read',
      'tasks:read', 'tasks:write',
      'notifications:read', 'notifications:write',
      'ai:sessions',
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Lehrling',
    description: 'Limited field access, supervised',
    permissionKeys: [
      'project:read',
      'field-service:read',
      'tasks:read',
      'notifications:read',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write', 'time-tracking:admin',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'User',
    description: 'Default role for new users with basic read access',
    permissionKeys: [
      'users:read',
      'roles:read',
      'crm:read',
      'projects:read',
      'project:read',
      'tasks:read', 'tasks:write',
      'notifications:read',
      'ai:sessions',
      'time-tracking:read', 'time-tracking:write',
    ],
  },
];

export async function seedDatabase() {
  try {
    // 1. Upsert all permissions — runs on every startup so new entries reach existing DBs
    await Promise.all(
      PERMISSION_DEFINITIONS.map((def) =>
        Permission.findOneAndUpdate(
          { module: def.module, action: def.action },
          { $setOnInsert: def },
          { upsert: true, returnDocument: 'after' },
        ),
      ),
    );

    // Build lookup map: 'module:action' → ObjectId
    const allPermissions = await Permission.find();
    const permMap = new Map();
    for (const p of allPermissions) {
      permMap.set(`${p.module}:${p.action}`, p._id);
    }
    const allPermIds = [...permMap.values()];

    logger.info(`Permissions synced (${allPermissions.length} total)`, { module: 'seed' });

    // 2. Seed or update roles
    for (const roleDef of ROLE_DEFINITIONS) {
      const permIds =
        roleDef.permissionKeys === '*'
          ? allPermIds
          : roleDef.permissionKeys.map((key) => permMap.get(key)).filter(Boolean);

      const existingRole = await Role.findOne({ name: roleDef.name });

      if (existingRole) {
        if (roleDef.permissionKeys === '*') {
          // Admin: always own every permission (keeps pace with new modules)
          await Role.updateOne({ _id: existingRole._id }, { $set: { permissions: permIds } });
        } else {
          // Other roles: add any new permissions without removing manually-granted ones
          await Role.updateOne(
            { _id: existingRole._id },
            { $addToSet: { permissions: { $each: permIds } } },
          );
        }
      } else {
        await Role.create({
          name: roleDef.name,
          description: roleDef.description,
          permissions: permIds,
          isSystem: true,
        });
        logger.info(`Seeded role: ${roleDef.name} (${permIds.length} permissions)`, { module: 'seed' });
      }
    }

    // 3. Invalidate permission caches so stale [] entries don't block updated roles
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:permissions:*`);
      logger.info('Permission caches invalidated', { module: 'seed' });
    } catch {
      // Non-fatal: Redis may not be ready yet during very early startup
    }

    // 4. Seed admin user (if env vars are set) — idempotent
    if (config.admin?.email && config.admin?.password) {
      const existingAdmin = await User.findOne({ email: config.admin.email.toLowerCase() });
      if (!existingAdmin) {
        const adminRole = await Role.findOne({ name: 'Admin' });
        if (adminRole) {
          const hashedPw = await hashPassword(config.admin.password);

          const adminUser = await User.create({
            email: config.admin.email.toLowerCase(),
            passwordHash: hashedPw,
            firstName: config.admin.firstName || 'System',
            lastName: config.admin.lastName || 'Administrator',
            role: adminRole._id,
            status: 'active',
            passwordChangedAt: new Date(),
          });

          await PasswordHistory.create({
            userId: adminUser._id,
            passwordHash: hashedPw,
          });

          logger.info('Seeded admin user', { module: 'seed', email: config.admin.email });
        }
      }
    }

    // 5. Seed catalog data (units of measure, etc.)
    await seedCatalog();

    logger.info('Database seeding complete', { module: 'seed' });
  } catch (err) {
    logger.error('Database seeding failed', {
      module: 'seed',
      error: { message: err.message, stack: err.stack },
    });
    throw err;
  }
}

export default seedDatabase;
