import mongoose from 'mongoose';

export const CATALOG_CONNECTION_TYPES = ['SUPPLIER', 'MANUFACTURER', 'IGH', 'GENERIC'];
export const CATALOG_CONNECTION_FORMATS = ['CSV', 'JSON', 'XML'];
export const CATALOG_SYNC_STATUSES = ['NEVER', 'RUNNING', 'HEALTHY', 'FAILED', 'DISABLED'];

const catalogConnectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    providerKey: { type: String, required: true, trim: true, uppercase: true, maxlength: 80, unique: true },
    type: { type: String, enum: CATALOG_CONNECTION_TYPES, required: true, index: true },
    endpointUrl: { type: String, trim: true, maxlength: 1000, default: '' },
    format: { type: String, enum: CATALOG_CONNECTION_FORMATS, default: 'CSV' },
    syncSchedule: { type: String, trim: true, maxlength: 80, default: '@daily' },
    isEnabled: { type: Boolean, default: true, index: true },
    isPreferred: { type: Boolean, default: false, index: true },
    preferredRank: { type: Number, min: 0, default: 100 },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    supplierName: { type: String, trim: true, maxlength: 255, default: '' },
    manufacturerName: { type: String, trim: true, maxlength: 255, default: '' },
    defaultCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogCategory', default: null },
    defaultMarkupPercent: { type: Number, min: -100, max: 1000, default: null },
    defaultMarginPercent: { type: Number, min: -100, max: 99.99, default: null },
    credentials: {
      username: { type: String, trim: true, maxlength: 255, default: '' },
      password: { type: String, maxlength: 2000, default: '' },
      apiKey: { type: String, maxlength: 2000, default: '' },
      token: { type: String, maxlength: 2000, default: '' },
    },
    requestHeaders: { type: Map, of: String, default: {} },
    lastSyncedAt: { type: Date, default: null },
    lastSyncStatus: { type: String, enum: CATALOG_SYNC_STATUSES, default: 'NEVER', index: true },
    lastSyncError: { type: String, maxlength: 2000, default: '' },
    lastSyncSummary: {
      parsed: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      discontinued: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

catalogConnectionSchema.index({ isDeleted: 1, isEnabled: 1, type: 1 });
catalogConnectionSchema.index({ supplierId: 1 });
catalogConnectionSchema.index({ manufacturerName: 1 });
catalogConnectionSchema.index({ lastSyncStatus: 1, lastSyncedAt: -1 });

catalogConnectionSchema.pre('validate', function () {
  this.providerKey = String(this.providerKey || this.name || '').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');
  this.type = String(this.type || 'GENERIC').trim().toUpperCase();
  this.format = String(this.format || 'CSV').trim().toUpperCase();
  this.supplierName = String(this.supplierName || '').trim();
  this.manufacturerName = String(this.manufacturerName || '').trim();
});

catalogConnectionSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const CatalogConnection = mongoose.model('CatalogConnection', catalogConnectionSchema);
export default CatalogConnection;
