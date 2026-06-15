import mongoose from 'mongoose';

const catalogSnapshotSchema = new mongoose.Schema(
  {
    catalogArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
    articleNumber: { type: String, trim: true, maxlength: 50, default: '' },
    articleName: { type: String, trim: true, maxlength: 300, default: '' },
    articleDescription: { type: String, maxlength: 5000, default: '' },
    unitOfMeasure: { type: String, trim: true, maxlength: 20, default: '' },
    snapshotBasePrice: { type: Number, min: 0, default: 0 },
    snapshotCurrency: { type: String, trim: true, maxlength: 3, default: 'CHF' },
    catalogSource: { type: String, enum: ['INTERNAL', 'IGH', 'CUSTOM'], default: 'INTERNAL' },
    snapshotTakenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export default catalogSnapshotSchema;
