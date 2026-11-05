import InboundCall from '../modules/inboundCalling/inboundCall.model.js';
import InboundSettings from '../modules/inboundCalling/inboundSettings.model.js';
import InboundCallEvent from '../modules/inboundCalling/inboundCallEvent.model.js';
import Permission from '../modules/auth/permission.model.js';

export const name = '045_inbound_calls';

const PERMISSIONS = [
  { module: 'inbound-calls', action: 'read', description: 'View incoming calls, transcripts, analytics and settings' },
  { module: 'inbound-calls', action: 'write', description: 'Configure incoming-call AI answering, rules and act on incoming calls' },
  { module: 'inbound-calls', action: 'admin', description: "See every user's incoming calls" },
];

export async function up() {
  await InboundCall.createIndexes();
  await InboundSettings.createIndexes();
  await InboundCallEvent.createIndexes();
  for (const p of PERMISSIONS) {
    await Permission.updateOne({ module: p.module, action: p.action }, { $setOnInsert: p }, { upsert: true }).catch(() => {});
  }
}

export async function down() {
  // Indexes only; call history and settings are user data and are never dropped on rollback.
  await InboundCall.collection.dropIndex('inbound_sweep').catch(() => {});
}

export default { name, up, down };
