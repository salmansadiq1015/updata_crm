import mongoose from 'mongoose';

export const CONFIRMATION_METHODS = ['EMAIL', 'SMS', 'PHONE'];
export const CONFIRMATION_STATUSES = ['PENDING', 'SENT', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED'];

const appointmentDetailsSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
      unique: true,
    },
    customerContactName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    customerContactPhone: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    customerContactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 255,
      default: null,
    },
    appointmentWindow: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    confirmationMethod: {
      type: String,
      enum: CONFIRMATION_METHODS,
      default: null,
    },
    confirmationStatus: {
      type: String,
      enum: CONFIRMATION_STATUSES,
      default: 'PENDING',
    },
    confirmationSentAt: {
      type: Date,
      default: null,
    },
    customerNotes: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    reminderSentAt: {
      type: Date,
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
appointmentDetailsSchema.index({ confirmationStatus: 1 });

const AppointmentDetails = mongoose.model('AppointmentDetails', appointmentDetailsSchema);
export default AppointmentDetails;
