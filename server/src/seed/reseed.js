/**
 * Re-seed script: adds missing roles and admin user to an already-seeded database.
 *
 * Usage: node src/seed/reseed.js
 *
 * This is idempotent — safe to run multiple times.
 * It will NOT duplicate existing data.
 */

import 'dotenv/config';
import logger from '../shared/logger/index.js';
import { seedDoctplTemplates } from './doctplSeed.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import Permission from '../modules/auth/permission.model.js';
import Role from '../modules/auth/role.model.js';
import User from '../modules/auth/user.model.js';
import PasswordHistory from '../modules/auth/passwordHistory.model.js';
import { hashPassword } from '../shared/utils/crypto.js';
import config from '../config/index.js';

async function reseed() {
  console.log('Connecting to database...');
  await connectDatabase(logger);

  // Build permission lookup from existing DB
  const allPermissions = await Permission.find();
  const permMap = new Map();
  for (const p of allPermissions) {
    permMap.set(`${p.module}:${p.action}`, p._id);
  }
  const allPermIds = [...permMap.values()];

  console.log(`Found ${allPermissions.length} permissions in database.`);

  // Define roles to ensure exist
  const rolesToEnsure = [
    {
      name: 'Admin',
      description: 'Full system access, user management',
      permissionKeys: '*',
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

  for (const roleDef of rolesToEnsure) {
    const existing = await Role.findOne({ name: roleDef.name });
    if (existing) {
      console.log(`Role "${roleDef.name}" already exists — skipping.`);
      continue;
    }

    const permIds = roleDef.permissionKeys === '*'
      ? allPermIds
      : roleDef.permissionKeys.map((key) => permMap.get(key)).filter(Boolean);

    await Role.create({
      name: roleDef.name,
      description: roleDef.description,
      permissions: permIds,
      isSystem: true,
    });

    console.log(`Created role: ${roleDef.name} (${permIds.length} permissions)`);
  }

  // Ensure admin user exists
  const adminEmail = config.admin?.email || process.env.ADMIN_EMAIL;
  const adminPassword = config.admin?.password || process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const existing = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existing) {
      console.log(`Admin user "${adminEmail}" already exists — skipping.`);
    } else {
      const adminRole = await Role.findOne({ name: 'Admin' });
      if (!adminRole) {
        console.error('Admin role not found — cannot create admin user.');
      } else {
        const hashedPw = await hashPassword(adminPassword);

        const adminUser = await User.create({
          email: adminEmail.toLowerCase(),
          passwordHash: hashedPw,
          firstName: config.admin?.firstName || process.env.ADMIN_FIRST_NAME || 'System',
          lastName: config.admin?.lastName || process.env.ADMIN_LAST_NAME || 'Admin',
          role: adminRole._id,
          status: 'active',
          passwordChangedAt: new Date(),
        });

        await PasswordHistory.create({
          userId: adminUser._id,
          passwordHash: hashedPw,
        });

        console.log(`Created admin user: ${adminEmail}`);
      }
    }
  } else {
    console.log('No ADMIN_EMAIL/ADMIN_PASSWORD in env — skipping admin user.');
  }

  // Seed doctpl default templates
  const adminUserForSeed = await User.findOne({ email: (config.admin?.email || process.env.ADMIN_EMAIL || '').toLowerCase() });
  await seedDoctplTemplates(adminUserForSeed?._id);

  console.log('Re-seed complete.');
  await disconnectDatabase(logger);
  process.exit(0);
}

reseed().catch((err) => {
  console.error('Re-seed failed:', err);
  process.exit(1);
});
