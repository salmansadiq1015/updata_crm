import Lead from '../modules/crm/lead.model.js';
import ContactLogEntry from '../modules/crm/contactLog.model.js';
import LeadCommunication from '../modules/crm/leadCommunication.model.js';
import LeadFollowUp from '../modules/crm/leadFollowUp.model.js';
import LeadEvent from '../modules/crm/leadEvent.model.js';
import LeadAssignmentPolicy from '../modules/crm/leadAssignmentPolicy.model.js';
import SimCallEvent from '../modules/simCall/simCallEvent.model.js';
import SimSmsMessage from '../modules/simSms/simSmsMessage.model.js';
import { isValidTimezone } from '../modules/crm/leadWorkflowTime.js';

/**
 * 032 — lead workflow (Leads-A): follow-up inbox, timeline, assignment/SLA.
 *
 * - Indexes for LeadFollowUp / LeadEvent / LeadAssignmentPolicy, the lead SLA
 *   sweep, and lead-scoped timeline reads on SIM call events and SIM SMS
 *   messages (both previously campaign/conversation-indexed only).
 * - Backfills one LeadFollowUp per live lead contact-log entry with a
 *   follow-up date (idempotent via sourceKey). An entry written by a mobile /
 *   SIM communication gets the communication's key + recorded timezone, so a
 *   later completion retry never duplicates it. Whether an old follow-up was
 *   actually done is NOT recorded anywhere, so every backfilled one starts
 *   'open'; past-due ones are pre-marked as alerted so the first sweep does
 *   not send a notification storm for history.
 * - Existing leads get slaStatus 'none' (no SLA is retro-applied).
 */
export const name = '032_lead_workflow';

const VIA = 'migration_032';

export async function up() {
  await LeadFollowUp.createIndexes();
  await LeadEvent.createIndexes();
  await LeadAssignmentPolicy.createIndexes();
  await Lead.collection.createIndex({ slaStatus: 1, firstResponseDueAt: 1 }, { name: 'lead_sla_sweep' });
  await SimCallEvent.collection.createIndex({ leadId: 1, at: -1 }, { name: 'lead_timeline', partialFilterExpression: { leadId: { $type: 'objectId' } } });
  await SimSmsMessage.collection.createIndex({ leadId: 1, createdAt: -1 }, { name: 'lead_timeline' });

  await Lead.collection.updateMany({ slaStatus: { $exists: false } }, { $set: { slaStatus: 'none', escalationLevel: 0 } });

  const now = new Date();
  const cursor = ContactLogEntry.collection.find(
    { isDeleted: { $ne: true }, leadId: { $type: 'objectId' }, followUpAt: { $type: 'date' } },
    { projection: { _id: 1, leadId: 1, followUpAt: 1, employeeId: 1, createdBy: 1, channel: 1, subject: 1, note: 1, openPoints: 1 } },
  );
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    await LeadFollowUp.collection.bulkWrite(ops, { ordered: false });
    ops = [];
  };
  for await (const entry of cursor) {
    const comm = await LeadCommunication.collection.findOne(
      { contactLogId: entry._id },
      { projection: { _id: 1, route: 1, 'outcome.followUpTimezone': 1, 'outcome.notes': 1, createdBy: 1 } },
    );
    const due = entry.followUpAt;
    const tz = comm?.outcome?.followUpTimezone;
    const type = !comm ? 'contact_log' : comm.route === 'sim_sms_agent' ? 'sim_sms' : comm.route === 'sim_call_campaign' ? 'sim_call' : 'communication';
    const note = String(entry.openPoints || comm?.outcome?.notes || entry.subject || entry.note || '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
    const pastDue = due < now;
    ops.push({
      updateOne: {
        filter: { sourceKey: comm ? `communication:${comm._id}` : `contact_log:${entry._id}` },
        update: {
          $setOnInsert: {
            sourceKey: comm ? `communication:${comm._id}` : `contact_log:${entry._id}`,
            leadId: entry.leadId,
            ownerId: entry.employeeId || entry.createdBy,
            createdBy: entry.createdBy || null,
            dueAt: due,
            nextDueAt: due,
            timezone: isValidTimezone(tz) ? tz : null,
            channel: entry.channel || null,
            note,
            status: 'open',
            snoozedUntil: null,
            snoozeCount: 0,
            closedAt: null,
            source: { type, communicationId: comm?._id ?? null, callRecordId: null, contactLogId: entry._id, conversationId: null, requestedTimeText: null },
            overdueNotifiedFor: pastDue ? due : null,
            escalatedFor: pastDue ? due : null,
            actions: [{ action: 'created', at: now, by: null, details: { via: VIA, sourceType: type } }],
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
    if (ops.length >= 500) await flush();
  }
  await flush();
}

export async function down() {
  // Remove only backfilled follow-ups nobody has touched since; keep user work.
  await LeadFollowUp.collection.deleteMany({ 'actions.0.details.via': VIA, status: 'open', 'actions.1': { $exists: false } });
  await Lead.collection.dropIndex('lead_sla_sweep').catch(() => {});
  await SimCallEvent.collection.dropIndex('lead_timeline').catch(() => {});
  await SimSmsMessage.collection.dropIndex('lead_timeline').catch(() => {});
  // Collections leadfollowups / leadevents / leadassignmentpolicies are kept (user data).
}

export default { name, up, down };
