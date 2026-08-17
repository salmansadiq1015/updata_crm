import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

// Named party + address block attached to an object (client feedback #10):
// e.g. billing address (Rechnungsadresse, with c/o) and ownership (Eigentümerschaft).
const siteAddressPartySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 255, default: null },
    careOf: { type: String, trim: true, maxlength: 255, default: null },
    street: { type: String, trim: true, maxlength: 255, default: null },
    postalCode: { type: String, trim: true, maxlength: 10, default: null },
    city: { type: String, trim: true, maxlength: 100, default: null },
    canton: { type: String, trim: true, maxlength: 2, default: null },
  },
  { _id: false },
);

// Object-specific facility info (client feedback — Objektinformationen).
const emergencyHeatingSchema = new mongoose.Schema(
  {
    present: { type: Boolean, default: false },
    number: { type: String, trim: true, maxlength: 100, default: null },
  },
  { _id: false },
);

const keyBoxSchema = new mongoose.Schema(
  {
    present: { type: Boolean, default: false },
    code: { type: String, trim: true, maxlength: 100, default: null },
    depositedBy: { type: String, trim: true, maxlength: 255, default: null },
    depositedAt: { type: Date, default: null },
  },
  { _id: false },
);

const advertisingBoardSchema = new mongoose.Schema(
  {
    count: { type: Number, min: 0, default: null },
    type: { type: String, trim: true, maxlength: 255, default: null },
    location: { type: String, trim: true, maxlength: 255, default: null },
  },
  { _id: false },
);

const siteSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    siteNumber: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    street: { type: String, trim: true, maxlength: 255, default: null },
    postalCode: { type: String, trim: true, maxlength: 10, default: null },
    city: { type: String, trim: true, maxlength: 100, default: null },
    canton: { type: String, trim: true, maxlength: 2, default: null },
    country: { type: String, trim: true, maxlength: 2, default: 'CH' },
    floorUnit: { type: String, trim: true, maxlength: 100, default: null },
    accessInstructions: { type: String, maxlength: 2000, default: null },
    // Distinct billing address (Rechnungsadresse) and ownership (Eigentümerschaft)
    // for the object — client feedback #10. Free-form, optional.
    billingAddress: { type: siteAddressPartySchema, default: null },
    ownership: { type: siteAddressPartySchema, default: null },
    // Verwaltung: the managing agent, distinct from the owner — a régie bills
    // and is written to, while the owner may be someone else entirely.
    management: { type: siteAddressPartySchema, default: null },
    // Objektinformationen (client feedback): emergency heating, key box, boards.
    emergencyHeating: { type: emergencyHeatingSchema, default: null },
    keyBox: { type: keyBoxSchema, default: null },
    advertisingBoard: { type: advertisingBoardSchema, default: null },
    siteType: {
      type: String,
      enum: ['residential', 'commercial', 'industrial'],
      default: 'residential',
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
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
siteSchema.index({ customerId: 1 });
siteSchema.index({ customerId: 1, siteNumber: 1 }, { unique: true });
siteSchema.index({ postalCode: 1 });
siteSchema.index({ isDeleted: 1, status: 1 });
siteSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });

// --- Soft-delete pre-hook ---
siteSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Site = mongoose.model('Site', siteSchema);
export default Site;
