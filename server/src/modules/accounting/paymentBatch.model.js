import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';

export const BATCH_STATUSES = ['CREATED', 'EXPORTED', 'CONFIRMED', 'REJECTED'];

const pain002TransactionStatusSchema = new mongoose.Schema(
  {
    instructionId: { type: String, trim: true, maxlength: 100 },
    endToEndId: { type: String, trim: true, maxlength: 100 },
    status: { type: String, trim: true, maxlength: 20 },
    reason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const paymentBatchSchema = new mongoose.Schema(
  {
    batchNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    currency: { type: String, enum: CURRENCY_CODES, default: 'CHF' },
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
    exportedAt: { type: Date, default: null },
    exportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pain002Status: { type: String, trim: true, maxlength: 20, default: null },
    pain002Reason: { type: String, trim: true, maxlength: 500, default: null },
    pain002ReceivedAt: { type: Date, default: null },
    pain002TransactionStatuses: [pain002TransactionStatusSchema],
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
