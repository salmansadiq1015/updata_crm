import mongoose from 'mongoose';

const entityNoteSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['site', 'installation'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    category: {
      type: String,
      enum: ['general', 'warning', 'access_info', 'technical'],
      default: 'general',
    },
    isPinned: { type: Boolean, default: false },
    isWarning: { type: Boolean, default: false },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editableUntil: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
entityNoteSchema.index(
  { entityType: 1, entityId: 1 },
);
entityNoteSchema.index({ isDeleted: 1 });

// --- Soft-delete pre-hook ---
entityNoteSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const EntityNote = mongoose.model('EntityNote', entityNoteSchema);
export default EntityNote;
