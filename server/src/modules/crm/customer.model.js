import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

const customerSchema = new mongoose.Schema(
  {
    customerNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    ownerName: { type: String, trim: true, maxlength: 255, default: null },
    // Anrede / salutation (client feedback #1) — optional, null = "none"
    salutation: {
      type: String,
      enum: ['herr', 'frau', 'familie', 'firma', 'herr_frau', 'frau_herr', null],
      default: null,
    },
    type: {
      type: String,
      enum: ['private', 'business', 'partner', 'supplier'],
      required: true,
    },
    street: { type: String, trim: true, maxlength: 255, default: null },
    addressSupplement: { type: String, trim: true, maxlength: 255, default: null },
    postalCode: { type: String, trim: true, maxlength: 10, default: null },
    city: { type: String, trim: true, maxlength: 100, default: null },
    canton: { type: String, trim: true, maxlength: 2, default: null },
    country: { type: String, trim: true, maxlength: 2, default: 'CH' },
    phone: { type: String, trim: true, maxlength: 30, default: null },
    mobile: { type: String, trim: true, maxlength: 30, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 255, default: null },
    website: { type: String, trim: true, maxlength: 255, default: null },
    uidNumber: { type: String, trim: true, uppercase: true, maxlength: 50, default: null },
    vatNumber: { type: String, trim: true, uppercase: true, maxlength: 50, default: null },
    newsletterOptIn: { type: Boolean, default: false },
    newsletterChannel: {
      type: String,
      enum: ['email', 'whatsapp', 'both'],
      default: 'email',
    },
    notes: { type: String, maxlength: 5000, default: null },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    mergedIntoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
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
customerSchema.index({ postalCode: 1 });
customerSchema.index({ isDeleted: 1, status: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ type: 1 });
customerSchema.index({ ownerName: 1 });
customerSchema.index({ uidNumber: 1 });
customerSchema.index({ vatNumber: 1 });
customerSchema.index({ name: 1, postalCode: 1 }); // duplicate detection
customerSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });
customerSchema.index(
  { name: 'text', ownerName: 'text', city: 'text', email: 'text' },
  { weights: { name: 10, ownerName: 6, email: 5, city: 2 } },
);

// --- Soft-delete pre-hook ---
customerSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
