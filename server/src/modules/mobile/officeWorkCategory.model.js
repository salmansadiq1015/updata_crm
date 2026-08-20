import mongoose from 'mongoose';

/**
 * Breakdown of office hours (Administration, Sitzungen, Weiterbildung,
 * Interne Arbeiten). Configurable rather than a fixed enum, following the
 * Department pattern: the client adds its own without a release.
 */
const officeWorkCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    color: { type: String, trim: true, maxlength: 20, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

officeWorkCategorySchema.index({ isActive: 1, sortOrder: 1 });

const OfficeWorkCategory = mongoose.model('OfficeWorkCategory', officeWorkCategorySchema);
export default OfficeWorkCategory;
