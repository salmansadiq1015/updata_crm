import Team from '../modules/governance/team.model.js';
import AuditLog from '../modules/auth/auditLog.model.js';
import Lead from '../modules/crm/lead.model.js';

/**
 * Platform governance: Team collection indexes, access-log lookups (by lead and
 * by governance event) and the ownership indexes the team-scoped lead filter
 * ($or createdBy / assignedTo) uses. Index-only: no data is converted, so it is
 * safe to run before or after deploying the code, and rollback drops indexes only.
 */
export const name = '037_platform_governance';

const AUDIT_BY_LEAD = 'governance_lead_timestamp';
const AUDIT_BY_EVENT = 'governance_event_timestamp';
const LEAD_BY_ASSIGNEE = 'governance_assignedTo_createdAt';

export async function up() {
  await Team.createIndexes();
  await AuditLog.collection.createIndex(
    { module: 1, 'details.leadId': 1, timestamp: -1 },
    { name: AUDIT_BY_LEAD, partialFilterExpression: { module: 'governance' } },
  );
  await AuditLog.collection.createIndex(
    { module: 1, eventType: 1, timestamp: -1 },
    { name: AUDIT_BY_EVENT },
  );
  await Lead.collection.createIndex({ assignedTo: 1, createdAt: -1 }, { name: LEAD_BY_ASSIGNEE });
  // { createdBy: 1, createdAt: -1 } already exists on the Lead schema.
}

export async function down() {
  for (const [collection, index] of [
    [AuditLog.collection, AUDIT_BY_LEAD], [AuditLog.collection, AUDIT_BY_EVENT],
    [Lead.collection, LEAD_BY_ASSIGNEE],
  ]) {
    await collection.dropIndex(index).catch(() => {});
  }
  // Team documents are retained on rollback (never delete user-entered data).
}

export default { name, up, down };
