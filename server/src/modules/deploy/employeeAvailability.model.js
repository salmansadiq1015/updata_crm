import mongoose from 'mongoose';
import calendarCache from './calendarCache.js';

export const AVAILABILITY_TYPES = ['WORKING', 'VACATION', 'SICK', 'PUBLIC_HOLIDAY', 'COMPANY_CLOSURE', 'OTHER_ABSENCE'];

const employeeAvailabilitySchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    availabilityType: {
      type: String,
      enum: AVAILABILITY_TYPES,
      required: true,
    },
    workStart: {
      type: String,
      maxlength: 5,
      default: null,
    },
    workEnd: {
      type: String,
      maxlength: 5,
      default: null,
    },
    notes: {
      type: String,
      maxlength: 255,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
employeeAvailabilitySchema.index({ employeeId: 1, date: 1 }, { unique: true });

// Any write invalidates the cached calendar ranges (calendarCache.js).
calendarCache.registerInvalidation(employeeAvailabilitySchema);

const EmployeeAvailability = mongoose.model('EmployeeAvailability', employeeAvailabilitySchema);
export default EmployeeAvailability;
