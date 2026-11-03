import MessageRecipient from '../modules/messaging/messageRecipient.model.js';
import { smsSegments } from '../modules/messaging/personalization.js';
import Campaign from '../modules/messaging/campaign.model.js';

export const name = '042_messaging_campaign_idempotency';
export async function up() {
  await Campaign.createIndexes();
  let writes = [];
  for await (const recipient of MessageRecipient.find({ channel: 'sms', 'sms.segments': null }).select('_id rendered.bodyText').lean().cursor()) {
    writes.push({ updateOne: { filter: { _id: recipient._id, 'sms.segments': null }, update: { $set: { sms: smsSegments(recipient.rendered?.bodyText || '') } } } });
    if (writes.length === 500) { await MessageRecipient.bulkWrite(writes); writes = []; }
  }
  if (writes.length) await MessageRecipient.bulkWrite(writes);
  for await (const row of MessageRecipient.aggregate([
    { $match: { channel: 'sms', 'eligibility.eligible': true } },
    { $group: { _id: '$campaignId', totalSegments: { $sum: '$sms.segments' } } },
  ]).cursor()) {
    await Campaign.updateOne({ _id: row._id }, { $set: { 'summary.totalSegments': row.totalSegments } });
  }
}
export async function down() { /* Keep the duplicate-prevention index and evidence. */ }
export default { name, up, down };
