import mongoose from 'mongoose';

export const VEHICLE_NOTE_CATEGORIES = ['general', 'warning', 'service', 'other'];

// A note attached to a vehicle (Notizen tab).
const vehicleNoteSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    category: { type: String, enum: VEHICLE_NOTE_CATEGORIES, default: 'general' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

vehicleNoteSchema.index({ vehicleId: 1, createdAt: -1 });
vehicleNoteSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VehicleNote = mongoose.model('VehicleNote', vehicleNoteSchema);
export default VehicleNote;
