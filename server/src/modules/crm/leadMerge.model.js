import mongoose from 'mongoose';

/**
 * LeadMerge — the durable record of one lead merge (loser → survivor).
 *
 * It is both the crash-recovery journal and the undo record:
 *  - `steps` are checkpoints; a retry (POST /lead-merges/:id/resume, the
 *    same merge request again, or the periodic sweep) continues from the first
 *    unfinished step. Every step is idempotent.
 *  - `survivorBefore` / `loserBefore` are full snapshots taken under the merge
 *    lock (including qualification history) — the source of truth for undo.
 *  - `children.<collection>` lists exactly which rows were moved / retained /
 *    which consent rows were upgraded, recorded BEFORE each write, so undo
 *    replays that set and nothing else.
 */
export const MERGE_STATUSES = Object.freeze(['in_progress', 'completed', 'undoing', 'undone']);
export const MERGE_STEPS = Object.freeze(['children', 'survivor', 'loser', 'children_final', 'candidates']);

const stepSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  at: { type: Date, default: null },
}, { _id: false });

const leadMergeSchema = new mongoose.Schema({
  survivorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  loserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  survivorName: { type: String, default: null },
  loserName: { type: String, default: null },
  survivorNumber: { type: String, default: null },
  loserNumber: { type: String, default: null },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadDuplicateCandidate', default: null },

  status: { type: String, enum: MERGE_STATUSES, default: 'in_progress', index: true },
  steps: {
    children: { type: stepSchema, default: () => ({}) },
    survivor: { type: stepSchema, default: () => ({}) },
    loser: { type: stepSchema, default: () => ({}) },
    children_final: { type: stepSchema, default: () => ({}) },
    candidates: { type: stepSchema, default: () => ({}) },
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, maxlength: 1000, default: null },

  fieldSelections: { type: mongoose.Schema.Types.Mixed, default: {} },
  survivorBefore: { type: mongoose.Schema.Types.Mixed, required: true },
  loserBefore: { type: mongoose.Schema.Types.Mixed, required: true },
  // The field values the merge wrote onto the survivor (undo conflict check).
  survivorPatch: { type: mongoose.Schema.Types.Mixed, default: {} },
  addedTags: { type: [String], default: [] },
  takenQualificationKeys: { type: [String], default: [] },
  addedHistoryIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  children: { type: mongoose.Schema.Types.Mixed, default: {} },
  counts: { type: mongoose.Schema.Types.Mixed, default: {} },

  mergedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completedAt: { type: Date, default: null },
  undoneAt: { type: Date, default: null },
  undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  undoResult: { type: mongoose.Schema.Types.Mixed, default: null },
  // Undo checkpoints (survivor, children, loser, candidates) so an interrupted undo resumes.
  undoSteps: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, minimize: false, collection: 'leadmerges' });

leadMergeSchema.index({ status: 1, updatedAt: 1 });
leadMergeSchema.index({ createdAt: -1 });

const LeadMerge = mongoose.models.LeadMerge || mongoose.model('LeadMerge', leadMergeSchema);
export default LeadMerge;
