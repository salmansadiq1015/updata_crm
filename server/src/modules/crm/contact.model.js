import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

const contactSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    functionTitle: { type: String, trim: true, maxlength: 100, default: null },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    mobile: { type: String, trim: true, maxlength: 30, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 255, default: null },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
      index: true,
    },
    isPrimary: { type: Boolean, default: false },
    notes: { type: String, maxlength: 2000, default: null },
    migration: { type: migrationTraceSchema, default: () => ({}) },
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
contactSchema.index(
  { customerId: 1, isPrimary: 1 },
  { partialFilterExpression: { isPrimary: true } },
);
contactSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text', phone: 'text', mobile: 'text' },
  { weights: { firstName: 10, lastName: 10, email: 5, phone: 5, mobile: 5 } },
);
contactSchema.index({ email: 1 });
contactSchema.index({ isDeleted: 1 });
contactSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });

// --- Virtual ---
contactSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// --- Soft-delete pre-hook ---
contactSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Contact = mongoose.model('Contact', contactSchema);
export default Contact;
