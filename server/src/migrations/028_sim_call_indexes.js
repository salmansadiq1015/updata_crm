import SimCallCampaign from '../modules/simCall/simCallCampaign.model.js';
import SimCallTask from '../modules/simCall/simCallTask.model.js';
import SimCallEvent from '../modules/simCall/simCallEvent.model.js';

/** Indexes for the SIM call campaign collections (new collections; additive, idempotent). */
export const name = '028_sim_call_indexes';

export async function up() {
  await Promise.all([SimCallCampaign.createIndexes(), SimCallTask.createIndexes(), SimCallEvent.createIndexes()]);
}

export async function down() {
  // Collections hold call evidence; rollback keeps data and indexes (the module simply stops being mounted).
}

export default { name, up, down };
