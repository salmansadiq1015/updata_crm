import mongoose from 'mongoose';

const ciConfigurationSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    logo: {
      cmykFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      rgbFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      pngFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
      width: { type: Number, default: 150 },
      position: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
    },
    fonts: {
      primary: { type: String, default: 'Museo Sans' },
      weights: {
        light: {
          fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
          name: { type: String, default: null },
        },
        medium: {
          fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
          name: { type: String, default: null },
        },
        bold: {
          fileId: { type: mongoose.Schema.Types.ObjectId, default: null },
          name: { type: String, default: null },
        },
      },
    },
    colors: {
      primary: { type: String, default: '#1B3F8B' },
      secondary: { type: String, default: '#D4002A' },
      text: { type: String, default: '#1A1A1A' },
      muted: { type: String, default: '#6B7280' },
      border: { type: String, default: '#E5E7EB' },
      tableHeader: { type: String, default: '#F3F4F6' },
    },
    companyDetails: {
      address: {
        street: { type: String, default: null },
        zip: { type: String, default: null },
        city: { type: String, default: null },
        country: { type: String, default: 'Schweiz' },
      },
      phone: { type: String, default: null },
      email: { type: String, default: null },
      website: { type: String, default: null },
      vatNumber: { type: String, default: null },
      commercialRegister: { type: String, default: null },
      bankDetails: {
        bankName: { type: String, default: null },
        iban: { type: String, default: null },
        qrIban: { type: String, default: null },
        bic: { type: String, default: null },
        accountHolder: { type: String, default: null },
      },
    },
    isActive: { type: Boolean, default: true, index: true },
    version: { type: Number, default: 1 },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

const CIConfiguration = mongoose.model('CIConfiguration', ciConfigurationSchema);
export default CIConfiguration;
