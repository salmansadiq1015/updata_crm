import mongoose from 'mongoose';

export const LEAVE_TYPES = ['VACATION', 'SICK', 'OTHER_ABSENCE', 'PUBLIC_HOLIDAY', 'COMPANY_CLOSURE'];
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
export const LEAVE_UNITS = ['DAYS', 'HOURS'];

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    leaveType: {
      type: String,
      enum: LEAVE_TYPES,
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    unit: {
      type: String,
      enum: LEAVE_UNITS,
      default: 'DAYS',
    },
    hours: {
      type: Number,
      min: 0,
      default: null,
    },
    requestedDays: {
      type: Number,
      min: 0,
      default: 0,
    },
    reason: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    status: {
      type: String,
      enum: LEAVE_STATUSES,
      default: 'PENDING',
      index: true,
    },
    decisionNote: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

leaveRequestSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ isDeleted: 1, status: 1, startDate: 1 });

leaveRequestSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
export default LeaveRequest;
