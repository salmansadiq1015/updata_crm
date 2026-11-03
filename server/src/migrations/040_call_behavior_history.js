import CallRecord from '../modules/aiCalling/callRecord.model.js';

// Additive only: old calls retain absent metrics rather than invented history.
export const name = '040_call_behavior_history';
export async function up() {
  await CallRecord.collection.createIndex({ createdBy: 1, leadId: 1, campaignId: 1, createdAt: -1 }, { name: 'lead_call_behavior_history' });
}
export async function down() {
  await CallRecord.collection.dropIndex('lead_call_behavior_history').catch(error => { if (error.codeName !== 'IndexNotFound') throw error; });
}
export default { name, up, down };
