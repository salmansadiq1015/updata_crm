import mongoose from 'mongoose';

/**
 * Frozen copy of a commercial document (Offerte/Auftrag/Rechnung) taken the
 * moment an already-sent document is edited — the client's Versionsverwaltung:
 * editing a sent Offerte creates V2 while V1 stays readable here, and the V1
 * PDFs are archived automatically by the document generation.
 *
 * The snapshot is the full (populated, lean) document as it was before the
 * edit; it is display-only and never written back.
 */
const documentRevisionSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ['quotation', 'order', 'invoice'],
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    version: { type: Number, required: true, min: 1 },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

documentRevisionSchema.index({ documentType: 1, documentId: 1, version: -1 });

const DocumentRevision = mongoose.model('DocumentRevision', documentRevisionSchema);
export default DocumentRevision;
