import mongoose from 'mongoose';

const quotationReminderSchema = new mongoose.Schema(
  {
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      required: true,
    },
    type: {
      type: String,
      enum: ['follow_up', 'expiration_warning'],
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    snoozedUntil: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'SNOOZED', 'CANCELLED'],
      default: 'PENDING',
    },
  },
  {
    timestamps: true,
  },
);

// --- Indexes ---
quotationReminderSchema.index({ quotationId: 1, status: 1 });
quotationReminderSchema.index({ status: 1, scheduledAt: 1 });

const QuotationReminder = mongoose.model('QuotationReminder', quotationReminderSchema);
export default QuotationReminder;
