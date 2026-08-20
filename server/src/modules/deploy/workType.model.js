import mongoose from 'mongoose';

/**
 * Catalogue of works (Arbeiten) with the duration they usually take —
 * "Waschtisch ersetzen 1.5 h", "Boiler entkalken", "Thermostat ersetzen".
 *
 * Deliberately finer than Assignment.assignmentType, whose seven values would
 * give every "Wartung" one duration: the proposal has to be close enough to be
 * kept, or the disponent stops trusting it. The duration is a suggestion — it
 * pre-fills the assignment and stays editable.
 */
const workTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    // Minutes rather than hours: 1.5 h and 45 min both express exactly.
    standardDurationMin: { type: Number, required: true, min: 0, max: 24 * 60 },
    description: { type: String, trim: true, maxlength: 500, default: null },
    // Which kind of assignment it belongs to, so the picker can narrow down.
    assignmentType: { type: String, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

workTypeSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

const WorkType = mongoose.model('WorkType', workTypeSchema);
export default WorkType;
