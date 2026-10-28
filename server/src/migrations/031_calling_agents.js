import CallingAgent from '../modules/aiCalling/callingAgent.model.js';
import CallCampaign from '../modules/aiCalling/callCampaign.model.js';

export const name = '031_calling_agents';
export async function up() {
  await CallingAgent.createIndexes();
  await CallCampaign.collection.createIndex({ createdBy: 1, agentId: 1, createdAt: -1 });
  await CallCampaign.collection.createIndex({ createdBy: 1, agentId: 1, launchKey: 1 }, {
    unique: true, partialFilterExpression: { launchKey: { $type: 'string' }, agentId: { $type: 'objectId' } }, name: 'agent_launch_idempotency',
  });
}
export async function down() {
  await CallCampaign.collection.dropIndex('agent_launch_idempotency').catch(() => {});
  await CallCampaign.collection.dropIndex('createdBy_1_agentId_1_createdAt_-1').catch(() => {});
  // Retain agent data and history. Rollback never deletes user records.
}
export default { name, up, down };
