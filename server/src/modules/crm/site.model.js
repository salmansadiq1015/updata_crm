import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

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
