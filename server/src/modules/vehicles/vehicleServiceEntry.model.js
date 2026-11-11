import mongoose from 'mongoose';
import { VEHICLE_SERVICE_TYPES } from './vehicle.constants.js';

// A single service / maintenance record in a vehicle's log (Service & Wartung).
const vehicleServiceEntrySchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    type: { type: String, enum: VEHICLE_SERVICE_TYPES, default: 'maintenance' },
    date: { type: Date, required: true },
    mileageKm: { type: Number, min: 0, default: null },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    garage: { type: String, trim: true, maxlength: 255, default: null },
    cost: { type: Number, min: 0, default: null },
    currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: null },
    invoiceNumber: { type: String, trim: true, maxlength: 80, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vehicleServiceEntrySchema.index({ vehicleId: 1, date: -1 });
vehicleServiceEntrySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VehicleServiceEntry = mongoose.model('VehicleServiceEntry', vehicleServiceEntrySchema);
export default VehicleServiceEntry;
