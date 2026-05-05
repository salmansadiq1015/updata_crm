import Permission from '../modules/auth/permission.model.js';
import Role from '../modules/auth/role.model.js';
import User from '../modules/auth/user.model.js';
import PasswordHistory from '../modules/auth/passwordHistory.model.js';
import { hashPassword } from '../shared/utils/crypto.js';
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
const PERMISSION_DEFINITIONS = [
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
  { module: 'accounting', action: 'read', description: 'View accounting data' },
  { module: 'accounting', action: 'write', description: 'Create and update accounting entries' },
  { module: 'accounting', action: 'admin', description: 'Full accounting administration' },

  // Reports
  { module: 'reports', action: 'read', description: 'View reports' },
  { module: 'reports', action: 'write', description: 'Create and manage reports' },

  // Tasks
  { module: 'tasks', action: 'read', description: 'View tasks' },
  { module: 'tasks', action: 'write', description: 'Create and update tasks' },
  { module: 'tasks', action: 'delete', description: 'Delete tasks' },
  { module: 'tasks', action: 'admin', description: 'Full task administration' },

  // Notifications
  { module: 'notifications', action: 'read', description: 'View notifications' },
  { module: 'notifications', action: 'write', description: 'Send and manage notifications' },

  // Time Tracking
  { module: 'time-tracking', action: 'read', description: 'View time entries' },
  { module: 'time-tracking', action: 'write', description: 'Create and update time entries' },
  { module: 'time-tracking', action: 'admin', description: 'Full time tracking administration' },

  // Settings
  { module: 'settings', action: 'read', description: 'View system settings' },
  { module: 'settings', action: 'admin', description: 'Manage system settings' },
];

// Role definitions with permission keys
const ROLE_DEFINITIONS = [
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
      'quotations:read', 'quotations:write', 'quotations:delete', 'quotations:admin',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'field-service:read',
      'tasks:read', 'tasks:write', 'tasks:delete', 'tasks:admin',
      'notifications:read', 'notifications:write',
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
      'field-service:read', 'field-service:write', 'field-service:admin',
      'tasks:read', 'tasks:write',
      'notifications:read',
      'time-tracking:read', 'time-tracking:write', 'time-tracking:admin',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Buchhalter',
    description: 'Financial operations',
    permissionKeys: [
      'crm:read',
      'invoicing:read', 'invoicing:write', 'invoicing:delete', 'invoicing:admin',
      'accounting:read', 'accounting:write', 'accounting:admin',
      'reports:read', 'reports:write',
      'quotations:read',
      'tasks:read',
      'notifications:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Disponent',
    description: 'Scheduling and resource planning',
    permissionKeys: [
      'crm:read',
      'scheduling:read', 'scheduling:write', 'scheduling:admin',
      'field-service:read',
      'tasks:read', 'tasks:write',
      'notifications:read', 'notifications:write',
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Lehrling',
    description: 'Limited field access, supervised',
    permissionKeys: [
      'field-service:read',
      'tasks:read',
      'notifications:read',
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
      'tasks:read', 'tasks:write',
      'notifications:read',
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
          { upsert: true, new: true },
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

    // 3. Seed admin user (if env vars are set) — idempotent
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
