import SimSmsCampaign from '../modules/simSms/simSmsCampaign.model.js';
import SimSmsConversation from '../modules/simSms/simSmsConversation.model.js';
import SimSmsMessage from '../modules/simSms/simSmsMessage.model.js';

/** Indexes for the SIM SMS agent collections (new collections; additive, idempotent). */
export const name = '027_sim_sms_indexes';

export async function up() {
  await Promise.all([SimSmsCampaign.createIndexes(), SimSmsConversation.createIndexes(), SimSmsMessage.createIndexes()]);
}

export async function down() {
  // Collections hold communication evidence; rollback keeps data and indexes.
}

export default { name, up, down };
