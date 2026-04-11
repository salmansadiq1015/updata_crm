import mongoose from 'mongoose';

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'CUSTOM'];
export const RECURRENCE_END_TYPES = ['NEVER', 'AFTER_COUNT', 'UNTIL_DATE'];

const recurrencePatternSchema = new mongoose.Schema(
  {
    frequency: {
      type: String,
      enum: RECURRENCE_FREQUENCIES,
      required: true,
    },
    interval: {
      type: Number,
      min: 1,
      default: 1,
    },
    daysOfWeek: {
      type: String,
      maxlength: 30,
      default: null,
    },
    endType: {
      type: String,
      enum: RECURRENCE_END_TYPES,
      default: 'NEVER',
    },
    endCount: {
      type: Number,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const RecurrencePattern = mongoose.model('RecurrencePattern', recurrencePatternSchema);
export default RecurrencePattern;
