import LeadCommunication from '../modules/crm/leadCommunication.model.js';

/**
 * Indexes for device-originated lead communications (mobile SIM call / SMS):
 * unique { createdBy, operationId } for idempotent operations, and
 * { leadId, createdAt } for the per-lead history. Idempotent; mirrors the model.
 */
export const name = '025_lead_communication_indexes';

export async function up() {
  await LeadCommunication.createIndexes();
}

export async function down() {
  // Communication records are retained. Rollback only removes the migration
  // marker; dropping data or indexes requires a separate operation.
}

export default { name, up, down };
