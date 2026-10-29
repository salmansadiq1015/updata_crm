import mongoose from 'mongoose';

/**
 * LeadEvent — workflow events on a lead that have no other home: automatic /
 * manual assignment, first-response SLA start/breach/met, escalations and
 * follow-up overdue/escalation alerts. Read by the unified lead timeline.
 * `dedupeKey` makes sweep-written events idempotent (a retried sweep run never
 * records the same breach twice).
 */
export const LEAD_EVENT_TYPES = Object.freeze([
  'assignment.auto', 'assignment.manual', 'assignment.cleared',
  'sla.started', 'sla.breached', 'sla.escalated', 'sla.met', 'sla.late',
  'follow_up.overdue', 'follow_up.escalated',
]);

const leadEventSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  type: { type: String, enum: LEAD_EVENT_TYPES, required: true },
  at: { type: Date, required: true, default: Date.now },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  dedupeKey: { type: String, maxlength: 160, default: null },
}, { versionKey: false, collection: 'leadevents' });

leadEventSchema.index({ leadId: 1, at: -1, _id: -1 }, { name: 'lead_events_timeline' });
leadEventSchema.index({ dedupeKey: 1 }, { unique: true, name: 'lead_event_dedupe', partialFilterExpression: { dedupeKey: { $type: 'string' } } });

const LeadEvent = mongoose.model('LeadEvent', leadEventSchema);
export default LeadEvent;

/** Record an event; a duplicate dedupeKey is a no-op. Never throws. */
export async function recordLeadEvent({ leadId, type, at = new Date(), actor = null, details = null, dedupeKey = null }) {
  try {
    if (dedupeKey) {
      await LeadEvent.updateOne(
        { dedupeKey },
        { $setOnInsert: { leadId, type, at, actor, details, dedupeKey } },
        { upsert: true },
      );
    } else {
      await LeadEvent.create({ leadId, type, at, actor, details });
    }
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    return false;
  }
}
