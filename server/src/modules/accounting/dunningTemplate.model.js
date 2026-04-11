import mongoose from 'mongoose';

const dunningTemplateSchema = new mongoose.Schema(
  {
    level: {
      type: Number,
      min: 1,
      max: 3,
      unique: true,
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    bodyHtml: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    graceDays: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

const DunningTemplate = mongoose.model('DunningTemplate', dunningTemplateSchema);
export default DunningTemplate;
