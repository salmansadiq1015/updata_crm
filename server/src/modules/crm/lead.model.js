import mongoose from 'mongoose';

/**
 * Lead — a prospective customer (own `leads` collection), numbered L-##### via
 * the Counter service, with source/geo provenance and a one-click
 * Convert-to-Customer path (§4.3 / §5 of LEAD_GENERATION_DESIGN.md).
 * Single-tenant (createdBy), soft-deletable. Imported leads are idempotent via
 * a unique partial index on sourceMetadata.googlePlaceId.
 */

export const LEAD_TYPE = Object.freeze({
  BUSINESS: 'business',
  PRIVATE: 'private',
});

export const LEAD_STATUS = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  UNQUALIFIED: 'unqualified',
  CONVERTED: 'converted',
});

export const LEAD_SOURCE = Object.freeze({
  GOOGLE_PLACES: 'google_places',
  MANUAL: 'manual',
  WIDGET: 'widget',
  IMPORT: 'import',
});

// Website-enrichment lifecycle for a single lead. 'none' until the first run,
// 'running' while the scraper works, then a terminal 'done' / 'failed'. 'pending'
// is reserved for a lead queued inside a bulk enrichment run.
export const LEAD_ENRICHMENT_STATUS = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

// GeoJSON Point — coordinates are [lng, lat]. Nullable: default:undefined keeps
// the sub-document (and the 2dsphere entry) absent until a location is set.
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

const leadSchema = new mongoose.Schema(
  {
    leadNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    normalizedName: { type: String, trim: true, maxlength: 255, default: null },
    type: {
      type: String,
      enum: Object.values(LEAD_TYPE),
      default: LEAD_TYPE.BUSINESS,
    },
    status: {
      type: String,
      enum: Object.values(LEAD_STATUS),
      default: LEAD_STATUS.NEW,
    },
    address: {
      street: { type: String, trim: true, maxlength: 255, default: null },
      addressSupplement: { type: String, trim: true, maxlength: 255, default: null },
      // Neighborhood / district (e.g. "Johar Town", "Champs-Élysées"). Distinct
      // from the city — never a postal code.
      area: { type: String, trim: true, maxlength: 120, default: null },
      postalCode: { type: String, trim: true, maxlength: 20, default: null },
      city: { type: String, trim: true, maxlength: 120, default: null },
      // Swiss sub-national region (2-letter canton). Non-Swiss state/province
      // lives in `region` (canton stays CH-only for the HVAC home market).
      canton: { type: String, trim: true, maxlength: 2, default: null },
      region: { type: String, trim: true, maxlength: 120, default: null },
      // No blanket CH default — forcing every country-less lead to Switzerland
      // put foreign leads (e.g. Pakistan, Morocco) in the wrong country. Manual
      // single-create still defaults to CH via lead.validation (the Swiss home
      // market); imports/discovery set the country explicitly (null when truly
      // unknown) so nothing is ever invented here.
      country: { type: String, trim: true, maxlength: 2, default: null },
      // Full provider-supplied address string, kept verbatim for display.
      formatted: { type: String, trim: true, maxlength: 500, default: null },
    },
    phone: { type: String, trim: true, maxlength: 50, default: null },
    mobile: { type: String, trim: true, maxlength: 50, default: null },
    normalizedPhone: { type: String, trim: true, maxlength: 50, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 255, default: null },
    website: { type: String, trim: true, maxlength: 500, default: null },
    websiteDomain: { type: String, trim: true, maxlength: 255, default: null },
    // Public social-profile URLs. Populated by website enrichment (fill-missing
    // only) or edited by hand; each defaults to null until discovered.
    social: {
      facebook: { type: String, trim: true, maxlength: 500, default: null },
      instagram: { type: String, trim: true, maxlength: 500, default: null },
      linkedin: { type: String, trim: true, maxlength: 500, default: null },
      twitter: { type: String, trim: true, maxlength: 500, default: null },
      youtube: { type: String, trim: true, maxlength: 500, default: null },
      tiktok: { type: String, trim: true, maxlength: 500, default: null },
    },
    location: { type: pointSchema, default: undefined },
    // Display-only snapshot captured at import; not a live feed.
    providerMeta: {
      rating: { type: Number, default: null },
      reviewCount: { type: Number, default: null },
      priceLevel: { type: String, trim: true, maxlength: 40, default: null },
      // Per-star review histogram { one, two, three, four, five }, ONLY when the
      // provider actually supplied it (Google place page). `null` means the
      // breakdown is unavailable — never fabricated or estimated from the total.
      ratingDistribution: { type: mongoose.Schema.Types.Mixed, default: null },
      // Operational status string the provider exposed (e.g. "Open", "Closed").
      businessStatus: { type: String, trim: true, maxlength: 60, default: null },
      // Opening hours as the provider supplied them (string or array of lines).
      openingHours: { type: mongoose.Schema.Types.Mixed, default: null },
      // Photo references the provider actually supplied; never fabricated.
      photos: {
        type: [
          new mongoose.Schema(
            {
              url: { type: String, trim: true, maxlength: 2000 },
              source: { type: String, trim: true, maxlength: 60, default: null },
              attribution: { type: String, trim: true, maxlength: 255, default: null },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
      // Canonical provider map link (Google Maps place / OSM), when known.
      mapsUrl: { type: String, trim: true, maxlength: 1000, default: null },
    },
    // Website-enrichment state + last-run audit trail (responsible scraper,
    // §lead module). foundEmails / foundPhones hold everything the last run
    // discovered (public business contact info only); the lead's own email /
    // phone are filled from them ONLY when empty (never overwritten).
    enrichment: {
      status: {
        type: String,
        enum: Object.values(LEAD_ENRICHMENT_STATUS),
        default: LEAD_ENRICHMENT_STATUS.NONE,
      },
      enrichedAt: { type: Date, default: null },
      source: { type: String, trim: true, maxlength: 40, default: null },
      foundEmails: { type: [String], default: [] },
      foundPhones: { type: [String], default: [] },
      error: { type: String, trim: true, maxlength: 500, default: null },
    },
    source: {
      type: String,
      enum: Object.values(LEAD_SOURCE),
      default: LEAD_SOURCE.MANUAL,
    },
    sourceMetadata: {
      googlePlaceId: { type: String, trim: true, maxlength: 255, default: null },
      discoverySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoverySession', default: null },
      discoveryResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscoveryResult', default: null },
      businessType: { type: String, trim: true, maxlength: 120, default: null },
      keyword: { type: String, trim: true, maxlength: 120, default: null },
      // The raw selected search location the lead was discovered under (e.g.
      // "Lahore" / "Lahore, Pakistan"). Kept so a city/country that had to be
      // filled from the search location can be audited and re-derived later.
      searchLocation: { type: String, trim: true, maxlength: 255, default: null },
      discoveryLocation: { type: mongoose.Schema.Types.Mixed, default: null },
      discoveryArea: { type: mongoose.Schema.Types.Mixed, default: null },
      discoverySearchCoordinates: { type: mongoose.Schema.Types.Mixed, default: null },
      discoveryBusinessTypes: { type: mongoose.Schema.Types.Mixed, default: [] },
      discoveredAt: { type: Date, default: null },
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: { type: String, maxlength: 5000, default: null },
    tags: { type: [String], default: [] },
    // Communication tracking (§ lead module). Stamped whenever a lead is
    // contacted: an email sent through the doctpl email service (sourceModule
    // 'lead') or a WhatsApp chat opened via the lead service. Drives the
    // "last contacted" marker on the lead list / detail.
    lastContactedAt: { type: Date, default: null },
    lastContactChannel: {
      type: String,
      enum: ['email', 'whatsapp', 'phone', 'sms', null],
      default: null,
    },
    convertedCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    convertedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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

// --- Indexes (§5) ---
leadSchema.index({ createdBy: 1, createdAt: -1 }); // lists
leadSchema.index({ status: 1 }); // pipeline
leadSchema.index({ assignedTo: 1 }); // "my leads"
// Import idempotency: a google-sourced place may back at most one lead.
leadSchema.index(
  { 'sourceMetadata.googlePlaceId': 1 },
  { unique: true, partialFilterExpression: { source: 'google_places' } },
);
leadSchema.index({ normalizedPhone: 1 }); // dedup ladder
leadSchema.index({ websiteDomain: 1 }); // dedup ladder
leadSchema.index({ name: 1, 'address.postalCode': 1 }); // dedup ladder
leadSchema.index({ location: '2dsphere' }); // geo dedup / map
leadSchema.index(
  { name: 'text', 'address.city': 'text', email: 'text' },
  { weights: { name: 10, email: 5, 'address.city': 2 } },
); // search

// --- Soft-delete pre-hook ---
leadSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
