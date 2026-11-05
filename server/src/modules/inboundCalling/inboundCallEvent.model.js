import mongoose from 'mongoose';

/**
 * Append-only log of every event that touched an incoming call (gateway reports, agent tool
 * calls that mutate state, owner commands). `eventKey` is unique: a retried gateway outbox
 * delivery or a replayed agent request is recognised and ignored. The log is persisted BEFORE
 * the event is applied, so it doubles as the replay source after a crash.
 */
const schema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, maxlength: 200 },
  inboundCallId: { type: mongoose.Schema.Types.ObjectId, ref: 'InboundCall', required: true, index: true },
  source: { type: String, enum: ['gateway', 'agent', 'owner', 'system'], required: true },
  type: { type: String, required: true, maxlength: 40 },
  occurredAt: { type: Date, default: Date.now },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  appliedAt: { type: Date, default: null },
  result: { type: String, maxlength: 60, default: null },
}, { timestamps: true });

schema.index({ inboundCallId: 1, occurredAt: 1 });

export default mongoose.models.InboundCallEvent || mongoose.model('InboundCallEvent', schema);
