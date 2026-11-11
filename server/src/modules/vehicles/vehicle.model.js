import mongoose from 'mongoose';
import {
  VEHICLE_STATUSES, VEHICLE_FUEL_TYPES, VEHICLE_ASSET_TYPES, VEHICLE_METER_UNITS,
  VEHICLE_TRANSMISSIONS, VEHICLE_OWNERSHIP_TYPES, plateKeyOf,
} from './vehicle.constants.js';

// Re-exported for existing importers (validation, seed).
export { VEHICLE_STATUSES, VEHICLE_FUEL_TYPES } from './vehicle.constants.js';

const str = (max) => ({ type: String, trim: true, maxlength: max, default: null });
const dateField = { type: Date, default: null };

const vehicleSchema = new mongoose.Schema(
  {
    // License plate — the primary human identifier (e.g. "MB-02" or "BS 12345").
    kennzeichen: { type: String, required: true, trim: true, maxlength: 30 },
    // Normalised plate: duplicate detection and plate search ignore spacing and case.
    plateKey: { type: String, default: null },
    label: str(120),
    fleetNumber: str(40),
    assetType: { type: String, enum: VEHICLE_ASSET_TYPES, default: 'car' },
    make: str(80),
    model: str(120),
    vin: str(40),
    color: str(40),
    fuelType: { type: String, enum: VEHICLE_FUEL_TYPES, default: 'diesel' },
    transmission: { type: String, enum: [...VEHICLE_TRANSMISSIONS, null], default: null },
    year: { type: Number, min: 1950, max: 2100, default: null },
    seats: { type: Number, min: 0, max: 200, default: null },
    payloadKg: { type: Number, min: 0, default: null },
    powerKw: { type: Number, min: 0, default: null },
    // Meter reading. Kept under its original name; `meterUnit` says what it counts.
    mileageKm: { type: Number, min: 0, default: 0 },
    meterUnit: { type: String, enum: VEHICLE_METER_UNITS, default: 'km' },
    status: { type: String, enum: VEHICLE_STATUSES, default: 'available' },
    currentDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Organisation
    department: str(120),
    location: str(160),
    costCenter: str(60),
    tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },

    // Ownership & finance
    ownershipType: { type: String, enum: VEHICLE_OWNERSHIP_TYPES, default: 'owned' },
    purchaseDate: dateField,
    purchasePrice: { type: Number, min: 0, default: null },
    provider: str(160),
    contractNumber: str(80),
    contractEnd: dateField,
    monthlyCost: { type: Number, min: 0, default: null },
    currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3, default: 'CHF' },

    // Compliance
    registrationExpiry: dateField,
    inspectionDue: dateField,
    emissionTestDue: dateField,
    insuranceProvider: str(160),
    insurancePolicyNumber: str(80),
    insuranceExpiry: dateField,

    // Denormalised service KPIs kept in sync from the service log.
    lastServiceDate: dateField,
    lastServiceKm: { type: Number, default: null },
    lastServiceGarage: str(255),
    nextServiceDate: dateField,
    nextServiceKm: { type: Number, default: null },

    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: dateField,
  },
  { timestamps: true },
);

vehicleSchema.index({ isDeleted: 1, kennzeichen: 1 });
vehicleSchema.index({ isDeleted: 1, status: 1 });
vehicleSchema.index({ isDeleted: 1, assetType: 1 });
vehicleSchema.index({ plateKey: 1 });
vehicleSchema.index({ currentDriverId: 1 }, { partialFilterExpression: { currentDriverId: { $type: 'objectId' } } });
vehicleSchema.index({ isDeleted: 1, nextServiceDate: 1 });

vehicleSchema.pre('validate', function () {
  if (this.isModified('kennzeichen') || !this.plateKey) this.plateKey = plateKeyOf(this.kennzeichen);
});

// Soft-delete: hide deleted vehicles from normal queries unless opted in.
vehicleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
