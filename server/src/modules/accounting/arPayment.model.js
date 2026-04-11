import mongoose from 'mongoose';

export const AR_PAYMENT_SOURCES = ['MANUAL', 'BANK_IMPORT'];

const arPaymentSchema = new mongoose.Schema(
  {
    paymentDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: 'CHF',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    paymentReference: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
    },
    bankTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    source: {
      type: String,
      enum: AR_PAYMENT_SOURCES,
      required: true,
    },
    allocatedAmount: {
      type: Number,
      default: 0,
    },
    unallocatedAmount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
arPaymentSchema.index({ customerId: 1 });
arPaymentSchema.index({ paymentDate: 1 });
arPaymentSchema.index({ bankTransactionId: 1 });

const ArPayment = mongoose.model('ArPayment', arPaymentSchema);
export default ArPayment;
