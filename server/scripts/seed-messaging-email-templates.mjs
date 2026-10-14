import '../src/config/loadEnv.js';
import mongoose from 'mongoose';
import MessageTemplate from '../src/modules/messaging/messageTemplate.model.js';
import Role from '../src/modules/auth/role.model.js';
import User from '../src/modules/auth/user.model.js';
import { seedMessagingEmailTemplates } from '../src/seed/messagingEmailTemplateSeed.js';

async function findSeedOwner() {
  const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (configuredEmail) {
    const configuredAdmin = await User.findOne({ email: configuredEmail, isDeleted: false }).select('_id').lean();
    if (configuredAdmin) return configuredAdmin;
  }

  const adminRole = await Role.findOne({ name: /^admin$/i }).select('_id').lean();
  if (!adminRole) return null;
  return User.findOne({ role: adminRole._id, isDeleted: false, status: 'active' })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const owner = await findSeedOwner();
  if (!owner) throw new Error('No active administrator is available to own the shared outreach templates');

  const result = await seedMessagingEmailTemplates(owner._id);
  const available = await MessageTemplate.countDocuments({ channel: 'email', isShared: true, isArchived: false });
  console.log(`Outreach email template library ready: ${result.created} created, ${result.existing} already present, ${available} shared templates available.`);
}

try {
  await run();
} catch (error) {
  console.error(`Outreach email template seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
