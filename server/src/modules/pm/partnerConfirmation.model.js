import mongoose from 'mongoose';

// --- Enum constants ---
const CONFIRMATION_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'DECLINED', 'ALTERNATIVE_PROPOSED'];

const partnerConfirmationSchema = new mongoose.Schema(
  {
    scheduleEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduleEntry',
      required: true,
    },
    partnerCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    partnerContactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
    },
    confirmationStatus: {
      type: String,
      enum: CONFIRMATION_STATUSES,
      default: 'DRAFT',
    },
    sentAt: { type: Date, default: null },
    responseAt: { type: Date, default: null },
    responseNotes: { type: String, maxlength: 2000, default: null },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// --- Indexes ---
partnerConfirmationSchema.index({ scheduleEntryId: 1 });
partnerConfirmationSchema.index({ confirmationStatus: 1 });

const PartnerConfirmation = mongoose.model('PartnerConfirmation', partnerConfirmationSchema);
export default PartnerConfirmation;
export { CONFIRMATION_STATUSES };
