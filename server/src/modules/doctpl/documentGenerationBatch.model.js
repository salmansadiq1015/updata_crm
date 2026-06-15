import mongoose from 'mongoose';

export const BATCH_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED'];
export const BATCH_ITEM_STATUSES = ['QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED'];

const batchItemSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true, min: 0 },
    templateType: { type: String, required: true, trim: true },
    sourceModule: { type: String, required: true, trim: true },
    sourceRecordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    language: { type: String, enum: ['de', 'fr', 'it', 'en'], default: 'de' },
    status: { type: String, enum: BATCH_ITEM_STATUSES, default: 'QUEUED', index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeneratedDocument', default: null },
    error: { type: String, maxlength: 2000, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const documentGenerationBatchSchema = new mongoose.Schema(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: BATCH_STATUSES, default: 'QUEUED', index: true },
    total: { type: Number, required: true, min: 0 },
    succeeded: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    items: [batchItemSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

documentGenerationBatchSchema.index({ createdAt: -1 });
documentGenerationBatchSchema.index({ createdBy: 1, createdAt: -1 });

const DocumentGenerationBatch = mongoose.model('DocumentGenerationBatch', documentGenerationBatchSchema);
export default DocumentGenerationBatch;
