import SimCallCampaign from '../modules/simCall/simCallCampaign.model.js';
import SimCallTask from '../modules/simCall/simCallTask.model.js';
import SimCallEvent from '../modules/simCall/simCallEvent.model.js';
import SimSmsMessage from '../modules/simSms/simSmsMessage.model.js';
import RecoveryItem, { SEVERITY_RANK } from '../modules/simSms/recoveryItem.model.js';
import logger from '../shared/logger/index.js';

/**
 * SIM call campaigns + SMS operations: indexes for the list/health/stats pages
 * and the 5-minute sweeps, plus the numeric RecoveryItem.severityRank the
 * recovery inbox now sorts by (the string severity sorted high → low → medium).
 *
 * Idempotent and additive: the backfill only touches items without a rank,
 * and createIndexes() builds what the schemas declare, leaving existing
 * indexes alone.
 */
export const name = '055_sim_sms_indexes';

export async function up() {
  for (const [severity, rank] of Object.entries(SEVERITY_RANK)) {
    const res = await RecoveryItem.updateMany({ severity, severityRank: { $exists: false } }, { $set: { severityRank: rank } });
    if (res.modifiedCount) logger.info('Recovery severityRank backfilled', { module: 'migration', severity, items: res.modifiedCount });
  }
  // Unknown/missing severity: the schema default (medium).
  await RecoveryItem.updateMany({ severityRank: { $exists: false } }, { $set: { severityRank: SEVERITY_RANK.medium } });

  for (const model of [SimCallCampaign, SimCallTask, SimCallEvent, SimSmsMessage, RecoveryItem]) await model.createIndexes();
}

const ADDED = [
  [SimCallCampaign, 'sim_call_campaign_feed'],
  [SimCallTask, 'sim_call_task_order'],
  [SimCallTask, 'sim_call_callback_due'],
  [SimCallTask, 'sim_call_sync_retry'],
  [SimCallEvent, 'sim_call_event_feed'],
  [SimSmsMessage, 'sim_sms_device_campaigns'],
  [RecoveryItem, 'recovery_inbox'],
  [RecoveryItem, 'recovery_inbox_type'],
];

export async function down() {
  for (const [model, index] of ADDED) {
    try { await model.collection.dropIndex(index); } catch (err) {
      if (err.codeName !== 'IndexNotFound') logger.warn('Index not dropped', { module: 'migration', index, error: err.message });
    }
  }
  // severityRank is left in place: harmless, and the code sorts by it.
}

export default { name, up, down };
