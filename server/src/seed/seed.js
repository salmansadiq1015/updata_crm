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
 * Idempotent: checks if data already exists before inserting.
 * Called once during server startup after database connection.
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
    permissionKeys: '*', // All permissions
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
      'time-tracking:read',
      'users:read', 'roles:read',
    ],
  },
  {
    name: 'Lehrling',

    description: 'Limited field access, supervised',
    permissionKeys: [
      'field-service:read',
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
      'time-tracking:read', 'time-tracking:write',
    ],
  },
];

export async function seedDatabase() {
  try {
    const permCount = await Permission.countDocuments();
    const isFirstSeed = permCount === 0;

    if (isFirstSeed) {
      logger.info('Seeding database (first run)...', { module: 'seed' });

      // 1. Seed permissions
      const permissions = await Permission.insertMany(PERMISSION_DEFINITIONS, { ordered: false });
      logger.info(`Seeded ${permissions.length} permissions`, { module: 'seed' });
    }

    // Build lookup map from DB (works for both first seed and re-seed)
    const allPermissions = await Permission.find();
    const permMap = new Map();
    for (const p of allPermissions) {
      permMap.set(`${p.module}:${p.action}`, p._id);
    }
    const allPermIds = [...permMap.values()];

    // 2. Seed roles — idempotent: only create if missing
    for (const roleDef of ROLE_DEFINITIONS) {
      const existingRole = await Role.findOne({ name: roleDef.name });
      if (existingRole) continue;

      const permIds = roleDef.permissionKeys === '*'
        ? allPermIds
        : roleDef.permissionKeys
          .map((key) => permMap.get(key))
          .filter(Boolean);

      await Role.create({
        name: roleDef.name,
        description: roleDef.description,
        permissions: permIds,
        isSystem: true,
      });

      logger.info(`Seeded role: ${roleDef.name} (${permIds.length} permissions)`, { module: 'seed' });
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

          // Save to password history
          await PasswordHistory.create({
            userId: adminUser._id,
            passwordHash: hashedPw,
          });

          logger.info('Seeded admin user', {
            module: 'seed',
            email: config.admin.email,
          });
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
