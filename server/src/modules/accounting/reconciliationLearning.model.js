import mongoose from 'mongoose';

export const RECONCILIATION_DIRECTIONS = ['INCOMING', 'OUTGOING'];
export const RECONCILIATION_TARGET_TYPES = ['AR_INVOICE', 'AP_INVOICE'];

const reconciliationLearningRuleSchema = new mongoose.Schema(
  {
    direction: {
      type: String,
      enum: RECONCILIATION_DIRECTIONS,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: RECONCILIATION_TARGET_TYPES,
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    normalizedPartyName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
      index: true,
    },
    partyIban: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 34,
      default: null,
      index: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
    },
    matchCount: { type: Number, default: 0, min: 0 },
    lastMatchedAt: { type: Date, default: Date.now },
    lastTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankTransaction',
      default: null,
    },
    lastInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

reconciliationLearningRuleSchema.index(
  { direction: 1, targetType: 1, partyIban: 1, entityId: 1 },
  {
    unique: true,
    partialFilterExpression: { partyIban: { $type: 'string' } },
  },
);
reconciliationLearningRuleSchema.index(
  { direction: 1, targetType: 1, normalizedPartyName: 1, entityId: 1 },
  {
    unique: true,
    partialFilterExpression: { normalizedPartyName: { $type: 'string' } },
  },
);

const ReconciliationLearningRule = mongoose.model('ReconciliationLearningRule', reconciliationLearningRuleSchema);
export default ReconciliationLearningRule;
