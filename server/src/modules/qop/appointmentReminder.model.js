import mongoose from 'mongoose';

const appointmentReminderSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    channel: {
      type: String,
      enum: ['whatsapp', 'email', 'both'],
      default: 'email',
    },
    language: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      default: 'de',
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RESPONDED'],
      default: 'PENDING',
    },
    customerResponse: {
      type: String,
      enum: ['confirmed', 'reschedule'],
      default: null,
    },
    messageContent: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// --- Indexes ---
appointmentReminderSchema.index({ status: 1, scheduledAt: 1 });
appointmentReminderSchema.index({ appointmentId: 1 });
appointmentReminderSchema.index({ customerId: 1 });

const AppointmentReminder = mongoose.model('AppointmentReminder', appointmentReminderSchema);
export default AppointmentReminder;
