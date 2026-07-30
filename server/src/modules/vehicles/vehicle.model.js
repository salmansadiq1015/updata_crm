import mongoose from 'mongoose';

export const VEHICLE_STATUSES = ['available', 'in_use', 'workshop'];
export const VEHICLE_FUEL_TYPES = ['diesel', 'petrol', 'electric', 'hybrid', 'other'];

const vehicleSchema = new mongoose.Schema(
  {
    // License plate — the primary human identifier (e.g. "MB-02" or "BS 12345").
    kennzeichen: { type: String, required: true, trim: true, maxlength: 30, index: true },
    label: { type: String, trim: true, maxlength: 120, default: null },
    make: { type: String, trim: true, maxlength: 80, default: null },
    model: { type: String, trim: true, maxlength: 120, default: null },
    vin: { type: String, trim: true, maxlength: 40, default: null },
    fuelType: { type: String, enum: VEHICLE_FUEL_TYPES, default: 'diesel' },
    year: { type: Number, min: 1950, max: 2100, default: null },
    mileageKm: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: VEHICLE_STATUSES, default: 'available', index: true },
    currentDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Denormalised service KPIs kept in sync from the service log.
    lastServiceDate: { type: Date, default: null },
    lastServiceKm: { type: Number, default: null },
    lastServiceGarage: { type: String, trim: true, maxlength: 255, default: null },
    nextServiceDate: { type: Date, default: null },
    nextServiceKm: { type: Number, default: null },
    imageFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vehicleSchema.index({ kennzeichen: 'text', label: 'text', make: 'text', model: 'text' });
vehicleSchema.index({ isDeleted: 1, status: 1 });

// Soft-delete: hide deleted vehicles from normal queries unless opted in.
vehicleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
