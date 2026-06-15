import mongoose from 'mongoose';
import catalogSnapshotSchema from '../../shared/schemas/catalogSnapshot.schema.js';

// --- Enum constants ---
const ACTION_TYPES = ['FUNDING_APPLICATION', 'MATERIAL_ORDER', 'SCHEDULING', 'OTHER'];
const ACTION_STATUSES = ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const FUNDING_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'];
const DELIVERY_STATUSES = ['PENDING', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED'];

// --- Embedded sub-document schemas ---
const fundingDetailsSchema = new mongoose.Schema(
  {
    fundingBody: { type: String, trim: true, maxlength: 255, default: null },
    applicationAmount: { type: Number, min: 0, default: null },
    approvedAmount: { type: Number, min: 0, default: null },
    submissionDate: { type: Date, default: null },
    expectedDecisionDate: { type: Date, default: null },
    fundingStatus: {
      type: String,
      enum: FUNDING_STATUSES,
      default: 'DRAFT',
    },
  },
  { _id: false },
);

const materialItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, maxlength: 20, default: 'Stk.' },
    catalogItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    catalogSnapshot: { type: catalogSnapshotSchema, default: null },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const materialOrderDetailsSchema = new mongoose.Schema(
  {
    supplier: { type: String, trim: true, maxlength: 255, default: null },
    orderReference: { type: String, trim: true, maxlength: 100, default: null },
    orderDate: { type: Date, default: null },
    expectedDeliveryDate: { type: Date, default: null },
    deliveryStatus: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: 'PENDING',
    },
    items: [materialItemSchema],
  },
  { _id: false },
);

// --- Main schema ---
const preparatoryActionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    actionType: {
      type: String,
      enum: ACTION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      maxlength: 5000,
      default: null,
    },
    isMandatory: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ACTION_STATUSES,
      default: 'CREATED',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    assignedToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    externalReference: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    fundingDetails: {
      type: fundingDetailsSchema,
      default: null,
    },
    materialOrderDetails: {
      type: materialOrderDetailsSchema,
      default: null,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
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
  },
);

// --- Indexes ---
preparatoryActionSchema.index({ projectId: 1 });
preparatoryActionSchema.index({ status: 1 });
preparatoryActionSchema.index({ dueDate: 1 });
preparatoryActionSchema.index({ isDeleted: 1 });

// --- Soft-delete pre-hook ---
preparatoryActionSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const PreparatoryAction = mongoose.model('PreparatoryAction', preparatoryActionSchema);
export default PreparatoryAction;
export { ACTION_TYPES, ACTION_STATUSES, FUNDING_STATUSES, DELIVERY_STATUSES };
