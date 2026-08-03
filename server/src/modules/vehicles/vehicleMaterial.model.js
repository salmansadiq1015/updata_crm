import mongoose from 'mongoose';

// A free-form material/equipment line carried by the vehicle (Materialliste).
const vehicleMaterialSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    name: { type: String, required: true, trim: true, maxlength: 255 },
    quantity: { type: Number, min: 0, default: 1 },
    unit: { type: String, trim: true, maxlength: 20, default: null },
    note: { type: String, trim: true, maxlength: 500, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vehicleMaterialSchema.index({ vehicleId: 1 });
vehicleMaterialSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VehicleMaterial = mongoose.model('VehicleMaterial', vehicleMaterialSchema);
export default VehicleMaterial;
