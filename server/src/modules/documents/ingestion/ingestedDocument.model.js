import mongoose from 'mongoose';

/**
 * One line per document the system took in by itself.
 *
 * Ingestion runs unattended: a mailbox is polled, a scan folder is swept, and
 * whatever arrives is filed. Without a record of each attempt, the office has
 * no way to answer the only question that matters when a paper goes missing —
 * did it arrive, and where did it go? A failure is kept as carefully as a
 * success, because a file that could not be filed is exactly the one somebody
 * will come looking for.
 *
 * `sourceRef` is what makes the run idempotent: the mailbox gives a message id
 * plus the attachment name, the folder gives the file's path and its size. Two
 * runs over the same inbox must not file the same invoice twice.
 */
export const INGESTION_SOURCES = ['mailbox', 'scan_folder'];
export const INGESTION_OUTCOMES = ['filed', 'unclassified', 'no_project', 'duplicate', 'failed'];

const ingestedDocumentSchema = new mongoose.Schema(
  {
    source: { type: String, enum: INGESTION_SOURCES, required: true },
    /** Unique per source — the guard against filing the same paper twice. */
    sourceRef: { type: String, required: true, maxlength: 500 },
    fileName: { type: String, required: true, maxlength: 300 },
    mimeType: { type: String, default: null, maxlength: 150 },
    sizeBytes: { type: Number, default: null },

    outcome: { type: String, enum: INGESTION_OUTCOMES, required: true },
    /** What Document AI read it as, and how it got there. */
    documentType: { type: String, default: null, maxlength: 60 },
    category: { type: String, default: null, maxlength: 40 },
    evidence: [{ type: String, maxlength: 300 }],

    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    /** The stored document, when one was created. */
    projectDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectDocument', default: null },

    /** Where it came from, in the words of the source: sender, subject, path. */
    origin: { type: String, default: null, maxlength: 500 },
    message: { type: String, default: null, maxlength: 1000 },
    error: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

ingestedDocumentSchema.index({ source: 1, sourceRef: 1 }, { unique: true });
ingestedDocumentSchema.index({ createdAt: -1 });
ingestedDocumentSchema.index({ outcome: 1, createdAt: -1 });

const IngestedDocument = mongoose.model('IngestedDocument', ingestedDocumentSchema);
export default IngestedDocument;
