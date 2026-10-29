import {
  ContactLedger, ContactPolicyDenial, ContactPolicySettings, ContactTouch,
} from '../modules/contactPolicy/contactPolicy.models.js';
import SmsDevice from '../modules/simSms/smsDevice.model.js';
import SmsAnswerReview from '../modules/simSms/smsAnswerReview.model.js';
import RecoveryItem from '../modules/simSms/recoveryItem.model.js';
import { DEFAULT_POLICY } from '../modules/contactPolicy/contactPolicy.constants.js';

/**
 * 036 — SMS operations + cross-channel contact policy.
 * Creates the indexes of the new collections and inserts the default contact
 * policy values (3 touches/day, 10/week, 60 min gap, quiet hours 20:00–08:00
 * lead-local) DISABLED, so deploying does not change dispatch behaviour; an
 * admin switches limits on in the contact-limit settings. DNC / suppression /
 * revoked consent are enforced across channels regardless. An existing
 * settings document is never overwritten.
 */
export const name = '036_sms_ops_contact_policy';
export async function up() {
  for (const model of [ContactPolicySettings, ContactLedger, ContactTouch, ContactPolicyDenial, SmsDevice, SmsAnswerReview, RecoveryItem]) {
    await model.createIndexes();
  }
  await ContactPolicySettings.updateOne(
    { key: 'global' },
    { $setOnInsert: { key: 'global', ...structuredClone(DEFAULT_POLICY), enabled: false } },
    { upsert: true },
  );
}
export async function down() {
  // Rollback keeps all data (touch ledger, devices, reviews, recovery items). Disabling
  // the policy restores the previous dispatch behaviour without deleting history.
  await ContactPolicySettings.updateOne({ key: 'global' }, { $set: { enabled: false } });
}
export default { name, up, down };
