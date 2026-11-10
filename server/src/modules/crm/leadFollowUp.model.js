import mongoose from 'mongoose';

/**
 * LeadFollowUp — a first-class follow-up ("call back Tuesday 10:00 Zurich time")
 * on a lead, with an owner and a lifecycle. Created manually, from a recorded
 * call/SMS outcome (leadCommunication completion, AI call callback, SIM SMS),
 * or backfilled from contact-log `followUpAt` (migration 032).
 *
 * `dueAt` is the instant the follow-up was planned for, `timezone` the IANA zone
 * it was planned in (null = not recorded). Snoozing moves `nextDueAt` and keeps
 * `dueAt`, so the original promise stays visible. Buckets and the sweep use
 * `nextDueAt`. `sourceKey` makes every automatic creation idempotent.
 */

export const FOLLOW_UP_STATUSES = Object.freeze(['open', 'snoozed', 'done', 'cancelled']);
export const FOLLOW_UP_OPEN_STATUSES = Object.freeze(['open', 'snoozed']);
export const FOLLOW_UP_TYPES = Object.freeze(['EMAIL', 'PHONE_CALL', 'AI_CALL', 'SMS', 'MEETING', 'CUSTOM_TASK']);
export const FOLLOW_UP_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
export const FOLLOW_UP_CHANNELS = Object.freeze(['phone', 'sms', 'email', 'whatsapp', 'in_person', 'letter', 'other']);
export const FOLLOW_UP_SOURCE_TYPES = Object.freeze([
  'manual', 'communication', 'ai_call', 'sim_sms', 'sim_call', 'contact_log', 'migration', 'inbound_call', 'workflow',
]);

const { ObjectId } = mongoose.Schema.Types;

const actionSchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'completed', 'snoozed', 'reassigned', 'cancelled', 'reopened', 'overdue', 'escalated', 'rescheduled'], required: true },
  at: { type: Date, required: true },
  by: { type: ObjectId, ref: 'User', default: null }, // null = system
  details: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

// AI follow-up calling (aiCalling/followUpCalling.service.js). mode 'human' (default) = an
// ordinary task; mode 'ai' = an AI agent places the call when due. State machine and outcome
// codes: aiCalling/engine/followUpDecision.js. Detailed call states live on the CallRecord.
const automationSchema = new mongoose.Schema({
  mode: { type: String, enum: ['human', 'ai'], default: 'human' },
  agentId: { type: ObjectId, ref: 'CallingAgent', default: null },
  state: { type: String, default: null }, // AUTOMATION_STATES
  reason: { type: String, maxlength: 60, default: null }, // FOLLOW_UP_OUTCOMES code that created it
  outcome: { type: String, maxlength: 60, default: null }, // code the follow-up call ended with
  round: { type: Number, min: 1, default: 1 },
  previousFollowUpId: { type: ObjectId, ref: 'LeadFollowUp', default: null },
  previousCallId: { type: ObjectId, ref: 'CallRecord', default: null },
  // The ORIGINAL campaign the chain of follow-ups started from (kept across rounds) — campaign analytics.
  originCampaignId: { type: ObjectId, ref: 'CallCampaign', default: null },
  routingRule: { type: String, maxlength: 120, default: null }, // name of the routing rule that chose the agent
  campaignId: { type: ObjectId, ref: 'CallCampaign', default: null },
  callRecordId: { type: ObjectId, ref: 'CallRecord', default: null },
  attempts: { type: Number, default: 0 },
  notBefore: { type: Date, default: null },      // dispatcher deferral (lead busy, phone busy) without moving the promise
  claimUntil: { type: Date, default: null },     // dispatcher lease
  lastError: { type: String, maxlength: 300, default: null },
  instructions: { type: String, maxlength: 2000, default: null }, // per-follow-up instructions for the agent
  timeResolution: {
    kind: { type: String, maxlength: 20, default: null },
    approximate: { type: Boolean, default: false },
    requestedText: { type: String, maxlength: 300, default: null },
    evidence: { type: String, maxlength: 300, default: null },
    shiftedFrom: { type: Date, default: null },
  },
  stateChangedAt: { type: Date, default: null },
  history: { type: [{ _id: false, state: String, at: Date, reason: String, by: { type: ObjectId, default: null } }], default: [] },
}, { _id: false });

const followUpSchema = new mongoose.Schema({
  leadId: { type: ObjectId, ref: 'Lead', required: true },
  ownerId: { type: ObjectId, ref: 'User', required: true },
  createdBy: { type: ObjectId, ref: 'User', default: null }, // null = created by the system

  dueAt: { type: Date, required: true },
  nextDueAt: { type: Date, required: true },
  timezone: { type: String, trim: true, maxlength: 64, default: null },
  channel: { type: String, enum: [...FOLLOW_UP_CHANNELS, null], default: null },
  note: { type: String, maxlength: 2000, default: null },
  taskType: { type: String, enum: [...FOLLOW_UP_TYPES, null], default: null },
  priority: { type: String, enum: FOLLOW_UP_PRIORITIES, default: 'NORMAL' },
  reminderMinutes: { type: Number, min: 0, max: 10080, default: null },
  reminderNotifiedFor: { type: Date, default: null },

  status: { type: String, enum: FOLLOW_UP_STATUSES, default: 'open' },
  snoozedUntil: { type: Date, default: null },
  snoozeCount: { type: Number, default: 0 },
  completedAt: { type: Date, default: null },
  completedBy: { type: ObjectId, ref: 'User', default: null },
  completionNote: { type: String, maxlength: 2000, default: null },
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: ObjectId, ref: 'User', default: null },
  cancelReason: { type: String, maxlength: 1000, default: null },
  // done/cancelled instant (sort key of the "done" bucket).
  closedAt: { type: Date, default: null },

  source: {
    type: { type: String, enum: FOLLOW_UP_SOURCE_TYPES, required: true },
    communicationId: { type: ObjectId, ref: 'LeadCommunication', default: null },
    callRecordId: { type: ObjectId, ref: 'CallRecord', default: null },
    campaignId: { type: ObjectId, ref: 'CallCampaign', default: null },
    callingAgentId: { type: ObjectId, ref: 'CallingAgent', default: null },
    inboundCallId: { type: ObjectId, ref: 'InboundCall', default: null },
    qualification: { type: String, maxlength: 40, default: null },
    recommendedAction: { type: String, maxlength: 80, default: null },
    contactLogId: { type: ObjectId, ref: 'ContactLogEntry', default: null },
    conversationId: { type: ObjectId, default: null },
    // Free text the lead used for the time ("tomorrow after lunch") when no
    // exact time was captured; never parsed into a fabricated instant.
    requestedTimeText: { type: String, maxlength: 300, default: null },
  },
  sourceKey: { type: String, maxlength: 120, default: null },

  // Sweep bookkeeping (leadSla.service): which due instant the overdue alert /
  // escalation was sent for, so a snooze re-arms them.
  overdueNotifiedFor: { type: Date, default: null },
  escalatedFor: { type: Date, default: null },

  actions: { type: [actionSchema], default: [] },
  automation: { type: automationSchema, default: () => ({}) },
}, { timestamps: true, collection: 'leadfollowups' });

followUpSchema.index({ ownerId: 1, status: 1, nextDueAt: 1, _id: 1 }, { name: 'follow_up_inbox' });
followUpSchema.index({ status: 1, nextDueAt: 1 }, { name: 'follow_up_sweep' });
followUpSchema.index({ leadId: 1, createdAt: -1 }, { name: 'follow_up_lead' });
followUpSchema.index({ ownerId: 1, closedAt: -1, _id: -1 }, { name: 'follow_up_done', partialFilterExpression: { closedAt: { $type: 'date' } } });
followUpSchema.index({ sourceKey: 1 }, { unique: true, name: 'follow_up_source_unique', partialFilterExpression: { sourceKey: { $type: 'string' } } });
followUpSchema.index({ 'source.contactLogId': 1 }, { name: 'follow_up_contact_log', partialFilterExpression: { 'source.contactLogId': { $type: 'objectId' } } });

followUpSchema.index({ 'automation.state': 1, nextDueAt: 1 }, { name: 'follow_up_ai_due', partialFilterExpression: { 'automation.mode': 'ai' } });
followUpSchema.index({ 'automation.agentId': 1, 'automation.state': 1, nextDueAt: 1 }, { name: 'follow_up_ai_agent', partialFilterExpression: { 'automation.mode': 'ai' } });

const LeadFollowUp = mongoose.model('LeadFollowUp', followUpSchema);
export default LeadFollowUp;
