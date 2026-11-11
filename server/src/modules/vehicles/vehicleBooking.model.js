import mongoose from 'mongoose';
import { VEHICLE_BOOKING_STATUSES } from './vehicle.constants.js';

// A reservation of a pool vehicle for a time window. Overlapping confirmed
// bookings of the same vehicle are refused by the service.
const vehicleBookingSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    bookedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    purpose: { type: String, trim: true, maxlength: 300, default: null },
    destination: { type: String, trim: true, maxlength: 200, default: null },
    status: { type: String, enum: VEHICLE_BOOKING_STATUSES, default: 'confirmed' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Overlap lookup: same vehicle, confirmed, start < newEnd and end > newStart.
vehicleBookingSchema.index({ vehicleId: 1, status: 1, start: 1, end: 1 });
vehicleBookingSchema.index({ bookedFor: 1, status: 1, start: 1 });

const VehicleBooking = mongoose.models.VehicleBooking || mongoose.model('VehicleBooking', vehicleBookingSchema);
export default VehicleBooking;
