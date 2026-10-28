/** Creates only the two requested support profiles; never assigns leads or launches calls.
 * Usage: node scripts/create-support-agents.mjs --owner-id <User ObjectId> [--apply]
 * Dry-run by default. Existing names are reported and never overwritten.
 */
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import service from '../src/modules/aiCalling/callingAgent.service.js';
import Agent from '../src/modules/aiCalling/callingAgent.model.js';
import User from '../src/modules/auth/user.model.js';
import AuditLog from '../src/modules/auth/auditLog.model.js';
import { createAgent } from '../src/modules/aiCalling/callingAgent.validation.js';

const ownerId = process.argv[process.argv.indexOf('--owner-id') + 1];
if (!process.argv.includes('--owner-id') || !mongoose.isValidObjectId(ownerId)) throw new Error('Provide --owner-id with the intended CRM user ID');
const apply = process.argv.includes('--apply');
let stage = 'connect';
try {
  await mongoose.connect(config.db.uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000, family: 4 });
  stage = 'owner';
  const owner = await User.findOne({ _id: ownerId, isDeleted: false, status: 'active' }).select('firstName lastName').lean();
  if (!owner) throw new Error('The intended active owner was not found');
  stage = 'profiles';
  const profiles = JSON.parse(await readFile(new URL('./data/support-agent-profiles.json', import.meta.url), 'utf8'));
  const results = [];
  for (const profile of profiles) {
    const { error, value } = createAgent.body.validate(profile, { abortEarly: false });
    if (error) throw error;
    stage = 'read existing profiles';
    const existing = await Agent.findOne({ createdBy: ownerId, name: value.name }).lean();
    let saved = existing;
    let action = existing ? 'already exists' : 'would create';
    if (!existing && apply) {
      stage = 'save profile';
      saved = await service.create(value, ownerId, { userAgent: 'Requested support agent setup', ipAddress: 'internal' });
      action = 'created';
      // Audit uses its normal direct-write fallback when run without the queue worker.
      // Wait for that write before closing this one-off database connection.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (await AuditLog.exists({ userId: ownerId, eventType: 'ai_calling.agent.created', 'details.agentId': saved._id })) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    if (saved && saved.questionnaire.questions.length !== 6) throw new Error(`Existing ${value.name} differs from the requested six-question profile; review it manually`);
    results.push({ action, id: saved?._id, name: saved?.name || value.name, questions: saved?.questionnaire.questions.length || value.questionnaire.questions.length, availability: saved?.availability || value.availability, avatarPresetId: saved?.avatarPresetId || value.avatarPresetId, assignedLeads: saved?.assignedLeadIds.length || 0 });
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', owner: `${owner.firstName} ${owner.lastName}`, agents: results }, null, 2));
} catch (error) {
  // Never print connection strings or credentials from database failures.
  console.error({ name: error.name, code: error.code, stage, message: error.name === 'ValidationError' ? error.message : 'Support profile setup failed; verify configuration and database access.' });
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
