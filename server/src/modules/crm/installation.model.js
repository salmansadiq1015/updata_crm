import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

const installationSchema = new mongoose.Schema(
  {
    installationNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
    },
    type: {
      type: String,
      enum: ['boiler', 'heat_pump', 'solar_thermal', 'radiator_system', 'ventilation', 'hot_water', 'other'],
      required: true,
    },
    manufacturer: { type: String, trim: true, maxlength: 100, default: null },
    model: { type: String, trim: true, maxlength: 100, default: null },
    serialNumber: { type: String, trim: true, maxlength: 100, default: null },
    commissioningDate: { type: Date, default: null },
    warrantyEndDate: { type: Date, default: null },
    powerOutputKw: { type: Number, default: null },
    fuelType: {
      type: String,
      enum: ['gas', 'oil', 'electric', 'pellet', 'other'],
      default: null,
    },
    yearOfManufacture: { type: Number, default: null },
    technicalNotes: { type: String, maxlength: 5000, default: null },
    status: {
      type: String,
      enum: ['active', 'maintenance', 'out_of_service', 'defective', 'decommissioned'],
      default: 'active',
      index: true,
    },
    decommissionedDate: { type: Date, default: null },
    decommissionReason: { type: String, maxlength: 500, default: null },
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
installationSchema.index({ siteId: 1 });
installationSchema.index({ type: 1 });
installationSchema.index({ manufacturer: 1 });
installationSchema.index(
  { serialNumber: 1 },
  { partialFilterExpression: { serialNumber: { $ne: null } } },
);
installationSchema.index({ isDeleted: 1, status: 1 });
installationSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });

// --- Soft-delete pre-hook ---
installationSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Installation = mongoose.model('Installation', installationSchema);
export default Installation;
