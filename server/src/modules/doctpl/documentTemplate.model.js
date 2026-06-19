import mongoose from 'mongoose';

export const TEMPLATE_TYPES = [
  'quotation',
  'order_confirmation',
  'invoice_standard',
  'invoice_advance',
  'invoice_final',
  'cover_letter',
  'service_report',
  'inspection_certificate',
  'project_appointment_confirmation',
  'project_status_report',
  'project_completion_certificate',
];

export const TEMPLATE_TYPE_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/;

const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['header', 'body', 'table', 'totals', 'deductions', 'qr_bill', 'footer', 'custom'],
      required: true,
    },
    position: { type: Number, required: true },
    isVisible: { type: Boolean, default: true },
    isConditional: { type: Boolean, default: false },
    conditionField: { type: String, default: null },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const tableColumnSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    label: {
      de: { type: String },
      fr: { type: String },
      it: { type: String },
      en: { type: String },
    },
    widthPercent: { type: Number, required: true, min: 1, max: 100 },
    alignment: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
    format: { type: String, enum: ['text', 'number', 'currency', 'percent', 'date'], default: 'text' },
  },
  { _id: false },
);

const textBlockSchema = new mongoose.Schema(
  {
    introduction: { type: String, maxlength: 5000 },
    terms: { type: String, maxlength: 10000 },
    footer: { type: String, maxlength: 2000 },
    emailSubject: { type: String, maxlength: 500 },
    emailBody: { type: String, maxlength: 10000 },
  },
  { _id: false },
);

const documentTemplateSchema = new mongoose.Schema(
  {
    templateType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
      match: [TEMPLATE_TYPE_PATTERN, 'Template type must be a lowercase slug'],
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: { type: String, maxlength: 1000, default: '' },
    currentVersion: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    approvalStatus: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    approvalRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalRequestedAt: { type: Date, default: null },
    approvalNote: { type: String, maxlength: 1000, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, maxlength: 1000, default: null },
    layout: {
      pageSize: { type: String, enum: ['A4', 'Letter'], default: 'A4' },
      orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
      margins: {
        top: { type: Number, default: 25 },
        bottom: { type: Number, default: 20 },
        left: { type: Number, default: 20 },
        right: { type: Number, default: 15 },
      },
      headerHeight: { type: Number, default: 45 },
      footerHeight: { type: Number, default: 30 },
    },
    sections: [sectionSchema],
    textBlocks: {
      de: { type: textBlockSchema },
      fr: { type: textBlockSchema },
      it: { type: textBlockSchema },
      en: { type: textBlockSchema },
    },
    tableColumns: [tableColumnSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
documentTemplateSchema.index({ isDeleted: 1, templateType: 1 });
documentTemplateSchema.index({ isDeleted: 1, isActive: 1 });

// --- Soft-delete pre-hook ---
documentTemplateSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const DocumentTemplate = mongoose.model('DocumentTemplate', documentTemplateSchema);
export default DocumentTemplate;
