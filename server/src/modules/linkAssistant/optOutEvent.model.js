import mongoose from 'mongoose';

/**
 * One opt-out ("do not contact me") as it was received, for the audit trail and
 * idempotency. `dedupeKey` makes a re-delivered SMS or a double tap a no-op.
 * No message text is stored beyond the matched keyword.
 */
export const OPT_OUT_SOURCES = Object.freeze([
  'web_link',             // the customer page (button or chat)
  'sms_reply_device',     // a STOP reply received by the company build's SMS receiver
  'sms_reply_reported',   // the user saw a STOP reply in their Messages app and recorded it
  'sim_sms_agent',        // a STOP reply inside an SMS-agent conversation
]);

const optOutEventSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  source: { type: String, enum: OPT_OUT_SOURCES, required: true },
  keyword: { type: String, maxlength: 40, default: null },
  dedupeKey: { type: String, required: true, maxlength: 200 },
  receivedAt: { type: Date, required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  effects: {
    sessionsClosed: { type: Number, default: 0 },
    smsConversationsCancelled: { type: Number, default: 0 },
    callHashes: { type: Number, default: 0 },
    smsSuppressed: { type: Boolean, default: false },
  },
}, { timestamps: true });
optOutEventSchema.index({ dedupeKey: 1 }, { unique: true });

export default mongoose.models.LinkOptOutEvent || mongoose.model('LinkOptOutEvent', optOutEventSchema);
