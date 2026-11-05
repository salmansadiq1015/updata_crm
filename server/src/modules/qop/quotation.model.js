import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';
import catalogSnapshotSchema from '../../shared/schemas/catalogSnapshot.schema.js';
import lineItemImageSchema from '../../shared/schemas/lineItemImage.schema.js';

export const QUOTATION_STATUSES = [
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED',
];

export const LINE_ITEM_TYPES = ['service', 'material', 'text', 'subtotal', 'optional'];

const lineItemSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    type: {
      type: String,
      enum: LINE_ITEM_TYPES,
      required: true,
    },
    catalogItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    catalogSnapshot: {
      type: catalogSnapshotSchema,
      default: null,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    unit: { type: String, maxlength: 20, default: null },
    quantity: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatRate: { type: Number, default: 8.1 },
    lineTotal: { type: Number, default: 0 },
    image: { type: lineItemImageSchema, default: null },
  },
  { _id: true },
);

const vatBreakdownSchema = new mongoose.Schema(
  {
    rate: { type: Number },
    base: { type: Number },
    amount: { type: Number },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    status: {
      type: String,
      enum: QUOTATION_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    language: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      default: 'de',
    },
    title: { type: String, maxlength: 500, default: '' },
    // Anrede printed above the introduction, freely editable
    // (e.g. "Sehr geehrte Frau Berger" or "Liebe Kseniya").
    salutation: { type: String, maxlength: 255, default: '' },
    introduction: { type: String, maxlength: 5000, default: '' },
    // Objekt-first flow: the quotation can start from a site; the customer is
    // derived from it and the printed recipient address is picked among the
    // site's parties (its billing address, owner or property management).
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    billingAddressSource: {
      type: String,
      enum: ['customer', 'site_billing', 'site_ownership', 'site_management'],
      default: 'customer',
    },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    currency: {
      type: String,
      enum: CURRENCY_CODES,
      default: 'CHF',
    },
    lineItems: [lineItemSchema],
    globalDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    subtotal: { type: Number, default: 0 },
    vatBreakdown: [vatBreakdownSchema],
    grandTotal: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    grandTotalRounded: { type: Number, default: 0 },
    paymentTerms: { type: String, maxlength: 1000, default: '' },
    notes: { type: String, maxlength: 5000, default: '' },
    termsAndConditions: { type: String, maxlength: 10000, default: '' },
    // Offer-specific: subsidy (Foerdergelder) deducted from the gross to show the
    // resulting investment total, plus free-text subsidy info and client-side works.
    subsidyAmount: { type: Number, min: 0, default: 0 },
    subsidyNote: { type: String, maxlength: 5000, default: '' },
    clientSideWorks: { type: String, maxlength: 5000, default: '' },
    // Offerte AI: the nine blocks the specification prescribes, kept structured
    // so the office can work through them; the customer-facing introduction is
    // composed from the first three.
    aiDraft: {
      type: new mongoose.Schema({
        blocks: {
          ausgangslage: { type: String, maxlength: 4000, default: '' },
          kundenziel: { type: String, maxlength: 4000, default: '' },
          technischeLoesung: { type: String, maxlength: 4000, default: '' },
          leistungsumfang: { type: String, maxlength: 4000, default: '' },
          optionen: { type: String, maxlength: 4000, default: '' },
          ausschluesse: { type: String, maxlength: 4000, default: '' },
          offenePunkte: { type: String, maxlength: 4000, default: '' },
          preispruefung: { type: String, maxlength: 4000, default: '' },
          versandbereitschaft: { type: String, maxlength: 4000, default: '' },
        },
        openPoints: [{ type: String, maxlength: 500 }],
        missingPrices: [{ type: String, maxlength: 500 }],
        recognizedWork: [{ type: String, maxlength: 200 }],
        sourceText: { type: String, maxlength: 20000, default: '' },
        generatedAt: { type: Date, default: Date.now },
      }, { _id: false }),
      default: null,
    },
    assignedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    declineReason: { type: String, maxlength: 2000, default: null },
    convertedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sourceQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Optimistic-lock counter, bumped on every save (technical).
    version: { type: Number, default: 1 },
    // Business document version (V1, V2, …): bumped only when an already-sent
    // quotation is edited; the previous state is kept as a DocumentRevision
    // and older PDFs are archived automatically.
    docVersion: { type: Number, default: 1 },
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
    migration: { type: migrationTraceSchema, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
quotationSchema.index({ customerId: 1, status: 1 });
quotationSchema.index({ status: 1, validUntil: 1 });
quotationSchema.index({ assignedUserId: 1, status: 1 });
quotationSchema.index({ projectId: 1 });
quotationSchema.index({ isDeleted: 1, createdAt: -1 });
quotationSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });
quotationSchema.index(
  { quotationNumber: 'text', title: 'text', customerName: 'text' },
  { weights: { quotationNumber: 10, title: 5, customerName: 3 } },
);

// --- Soft-delete pre-hook ---
quotationSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Quotation = mongoose.model('Quotation', quotationSchema);
export default Quotation;
