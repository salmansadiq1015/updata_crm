import mongoose from 'mongoose';

const documentNumberSequenceSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ['quotation', 'order', 'invoice'],
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    prefix: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
    },
    yearFormat: {
      type: String,
      enum: ['YYYY', 'YY', 'none'],
      default: 'YYYY',
    },
    separator: {
      type: String,
      maxlength: 3,
      default: '-',
    },
    paddingLength: {
      type: Number,
      default: 4,
      min: 1,
      max: 8,
    },
    currentValue: {
      type: Number,
      default: 0,
    },
    currentYear: {
      type: Number,
      default: () => new Date().getFullYear(),
    },
    resetsAnnually: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// --- Indexes ---
documentNumberSequenceSchema.index(
  { documentType: 1, departmentId: 1 },
  { unique: true },
);

const DocumentNumberSequence = mongoose.model(
  'DocumentNumberSequence',
  documentNumberSequenceSchema,
);
export default DocumentNumberSequence;
