import mongoose from 'mongoose';

const arPaymentAllocationSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ArPayment',
      required: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    allocatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    allocatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
arPaymentAllocationSchema.index({ paymentId: 1 });
arPaymentAllocationSchema.index({ invoiceId: 1 });

const ArPaymentAllocation = mongoose.model('ArPaymentAllocation', arPaymentAllocationSchema);
export default ArPaymentAllocation;
