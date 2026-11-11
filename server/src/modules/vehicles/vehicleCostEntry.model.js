import mongoose from 'mongoose';
import { VEHICLE_COST_TYPES } from './vehicle.constants.js';

// One operating cost of a vehicle: a tank fill, a charge, a toll, a fine…
// Service costs live on the service log and are summed alongside these.
const vehicleCostEntrySchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    type: { type: String, enum: VEHICLE_COST_TYPES, required: true },
    date: { type: Date, required: true },
    amount: { type: Number, min: 0, required: true },
    currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: 'CHF' },
    // Litres for fuel, kWh for charging; null for everything else.
    quantity: { type: Number, min: 0, default: null },
    quantityUnit: { type: String, enum: ['l', 'kwh', 'kg', 'gal', null], default: null },
    meterReading: { type: Number, min: 0, default: null },
    vendor: { type: String, trim: true, maxlength: 160, default: null },
    note: { type: String, trim: true, maxlength: 500, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vehicleCostEntrySchema.index({ vehicleId: 1, isDeleted: 1, date: -1 });
vehicleCostEntrySchema.index({ isDeleted: 1, date: -1 });
vehicleCostEntrySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VehicleCostEntry = mongoose.models.VehicleCostEntry || mongoose.model('VehicleCostEntry', vehicleCostEntrySchema);
export default VehicleCostEntry;
