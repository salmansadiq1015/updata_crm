import SimCallCampaign from '../modules/simCall/simCallCampaign.model.js';
import SimCallTask from '../modules/simCall/simCallTask.model.js';

export const name = '029_sim_call_reliability';
export async function up() {
  await SimCallCampaign.createIndexes();
  await SimCallTask.createIndexes();
}
export async function down() {
  // Keep evidence and additive uniqueness protections across a code rollback.
}
export default { name, up, down };
