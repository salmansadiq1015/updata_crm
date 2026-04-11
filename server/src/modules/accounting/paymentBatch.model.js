import mongoose from 'mongoose';

export const BATCH_STATUSES = ['CREATED', 'EXPORTED', 'CONFIRMED', 'REJECTED'];

const paymentBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    totalAmount: { type: Number, default: 0 },
    invoiceCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: BATCH_STATUSES,
      default: 'CREATED',
    },
    pain001FileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      default: null,
    },
    invoiceIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ApInvoice',
      },
    ],
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
paymentBatchSchema.index({ status: 1 });
paymentBatchSchema.index({ createdAt: -1 });

const PaymentBatch = mongoose.model('PaymentBatch', paymentBatchSchema);
export default PaymentBatch;
