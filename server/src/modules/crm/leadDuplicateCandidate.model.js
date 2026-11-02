import mongoose from 'mongoose';

/**
 * LeadDuplicateCandidate — one suspected duplicate PAIR of leads, produced by
 * leadDuplicate.service detection (on create/import and by the periodic scan).
 * Pairs are keyed by the two sorted lead ids so detection is idempotent; groups
 * are formed at read time (connected components over open pairs).
 *
 * A "not a duplicate" decision is remembered: a dismissed pair is never reopened
 * by detection. A merged pair records the merge that resolved it.
 */
export const DUPLICATE_METHODS = Object.freeze([
  'PLACE_ID', 'PHONE', 'EMAIL', 'WEBSITE', 'NAME_POSTAL', 'NAME_NEARBY', 'BUSINESS_IDENTITY',
]);
export const CANDIDATE_STATUSES = Object.freeze(['open', 'dismissed', 'merged', 'stale']);

const reasonSchema = new mongoose.Schema({
  method: { type: String, enum: DUPLICATE_METHODS, required: true },
  value: { type: String, maxlength: 300, default: null },
  confidence: { type: Number, min: 0, max: 1, required: true },
}, { _id: false });

const candidateSchema = new mongoose.Schema({
  pairKey: { type: String, required: true, unique: true },
  leadIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lead' }],
    validate: (v) => Array.isArray(v) && v.length === 2,
    required: true,
  },
  reasons: { type: [reasonSchema], default: [] },
  confidence: { type: Number, min: 0, max: 1, required: true },
  status: { type: String, enum: CANDIDATE_STATUSES, default: 'open' },
  detectedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dismissedAt: { type: Date, default: null },
  dismissReason: { type: String, maxlength: 500, default: null },
  mergeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadMerge', default: null },
}, { timestamps: true, collection: 'leadduplicatecandidates' });

candidateSchema.index({ status: 1, confidence: -1, _id: 1 });
candidateSchema.index({ leadIds: 1, status: 1 });

export function pairKeyOf(a, b) {
  const [x, y] = [String(a), String(b)].sort();
  return `${x}_${y}`;
}

const LeadDuplicateCandidate = mongoose.models.LeadDuplicateCandidate
  || mongoose.model('LeadDuplicateCandidate', candidateSchema);
export default LeadDuplicateCandidate;
