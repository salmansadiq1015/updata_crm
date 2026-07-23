import mongoose from 'mongoose';

/**
 * Undo record for a customer merge.
 *
 * merge() reassigns documents with updateMany, which leaves no trace of which
 * rows actually moved — a customer that already belonged to the target must not
 * be handed to the source on undo. So the ids are captured *before* the move and
 * stored here; undo replays exactly this set and nothing else.
 *
 * targetFieldsBefore holds the target's previous values for the fields the merge
 * overwrote, so the undo can put them back.
 */
const customerMergeSchema = new mongoose.Schema(
  {
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    sourceName: { type: String, default: null },
    targetName: { type: String, default: null },

    // Documents reassigned from source to target, by collection.
    moved: {
      contacts: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      sites: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      notes: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      quotations: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      orders: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      invoices: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    },

    // Field overrides applied to the target, and the values they replaced.
    targetFieldsBefore: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Status the source held before it was deactivated by the merge.
    sourceStatusBefore: { type: String, default: 'active' },

    mergedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    undoneAt: { type: Date, default: null },
    undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// The undo list shows the most recent merges that can still be reversed.
customerMergeSchema.index({ undoneAt: 1, createdAt: -1 });

const CustomerMerge = mongoose.model('CustomerMerge', customerMergeSchema);
export default CustomerMerge;
