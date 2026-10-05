import mongoose from 'mongoose';

/**
 * Discovery result — one business discovered within a session, keyed by the
 * provider place id. Deduplicated/matched against existing leads + customers
 * and the launch point for a one-click import into the leads collection
 * (§4.2 / §5 of LEAD_GENERATION_DESIGN.md). Single-tenant (createdBy),
 * soft-deletable. Raw provider payloads are not stored wholesale.
 */

export const RESULT_MATCHING_STATUS = Object.freeze({
  NEW: 'NEW',
  EXISTING: 'EXISTING',
  POSSIBLE_DUPLICATE: 'POSSIBLE_DUPLICATE',
});

export const RESULT_IMPORT_STATUS = Object.freeze({
  NOT_IMPORTED: 'NOT_IMPORTED',
  QUEUED: 'QUEUED',
  IMPORTED: 'IMPORTED',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED',
});

export const RESULT_MATCH_METHOD = Object.freeze({
  PLACE_ID: 'PLACE_ID',
  PHONE: 'PHONE',
  WEBSITE: 'WEBSITE',
  NAME_ADDRESS: 'NAME_ADDRESS',
  GEO: 'GEO',
});

// GeoJSON Point — coordinates are [lng, lat].
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

const matchedBySchema = new mongoose.Schema(
  {
    method: { type: String, enum: Object.values(RESULT_MATCH_METHOD) },
    confidence: { type: Number, default: null },
  },
  { _id: false },
);

const discoveryResultSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    discoverySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscoverySession',
      required: true,
    },
    provider: {
      name: { type: String, trim: true, maxlength: 60, default: 'google_places' },
      placeId: { type: String, trim: true, maxlength: 255, required: true },
    },
    business: {
      name: { type: String, trim: true, maxlength: 255, default: null },
      normalizedName: { type: String, trim: true, maxlength: 255, default: null },
      primaryType: { type: String, trim: true, maxlength: 120, default: null },
      types: { type: [String], default: [] },
      phone: { type: String, trim: true, maxlength: 50, default: null },
      internationalPhone: { type: String, trim: true, maxlength: 50, default: null },
      normalizedPhone: { type: String, trim: true, maxlength: 50, default: null },
      website: { type: String, trim: true, maxlength: 500, default: null },
      websiteDomain: { type: String, trim: true, maxlength: 255, default: null },
      // Only if the provider supplies it; never fabricated.
      email: { type: String, trim: true, lowercase: true, maxlength: 255, default: null },
      address: {
        formatted: { type: String, trim: true, maxlength: 500, default: null },
        street: { type: String, trim: true, maxlength: 255, default: null },
        city: { type: String, trim: true, maxlength: 120, default: null },
        region: { type: String, trim: true, maxlength: 120, default: null },
        postalCode: { type: String, trim: true, maxlength: 20, default: null },
        country: { type: String, trim: true, maxlength: 100, default: null },
        canton: { type: String, trim: true, maxlength: 2, default: null },
      },
      location: { type: pointSchema, default: undefined },
      rating: { type: Number, default: null },
      reviewCount: { type: Number, default: null },
      priceLevel: { type: String, trim: true, maxlength: 40, default: null },
      businessStatus: { type: String, trim: true, maxlength: 40, default: null },
      openingHours: { type: mongoose.Schema.Types.Mixed, default: null },
      mapsUrl: { type: String, trim: true, maxlength: 1000, default: null },
    },
    matching: {
      status: {
        type: String,
        enum: Object.values(RESULT_MATCHING_STATUS),
        default: RESULT_MATCHING_STATUS.NEW,
      },
      matchedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
      matchedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
      matchedBy: { type: [matchedBySchema], default: [] },
    },
    import: {
      status: {
        type: String,
        enum: Object.values(RESULT_IMPORT_STATUS),
        default: RESULT_IMPORT_STATUS.NOT_IMPORTED,
      },
      leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
      importedAt: { type: Date, default: null },
      error: {
        code: { type: String, default: null },
        message: { type: String, default: null },
      },
    },
    // When contact/hour fields were fetched (either directly by the search
    // field mask or by a later Place Details request).
    details: {
      fetchedAt: { type: Date, default: null },
      source: { type: String, trim: true, maxlength: 40, default: null },
    },
    discoveryContext: {
      businessTypeIds: { type: [String], default: [] },
      businessTypes: { type: mongoose.Schema.Types.Mixed, default: [] },
      matchedBusinessTypeId: { type: String, trim: true, maxlength: 120, default: null },
      keyword: { type: String, trim: true, maxlength: 120, default: null },
      areaType: { type: String, trim: true, maxlength: 40, default: null },
      location: { type: mongoose.Schema.Types.Mixed, default: null },
      area: { type: mongoose.Schema.Types.Mixed, default: null },
      providerQuery: { type: mongoose.Schema.Types.Mixed, default: null },
      searchCoordinates: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    discoveredAt: { type: Date, default: Date.now },
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
discoveryResultSchema.index({ createdBy: 1, discoverySessionId: 1, createdAt: -1 }); // results list per session
discoveryResultSchema.index({ discoverySessionId: 1, _id: 1 }); // complete lightweight marker stream
discoveryResultSchema.index(
  { discoverySessionId: 1, 'provider.placeId': 1 },
  { unique: true },
); // in-session identity / upsert idempotency
discoveryResultSchema.index({ createdBy: 1, 'matching.status': 1 }); // filter NEW/EXISTING
discoveryResultSchema.index({ createdBy: 1, 'import.status': 1 }); // import filtering / Add-All-New
discoveryResultSchema.index({ 'business.location': '2dsphere' }); // proximity / in-area queries
discoveryResultSchema.index({ createdBy: 1, 'business.normalizedPhone': 1 }); // dedup lookup
discoveryResultSchema.index({ createdBy: 1, 'business.websiteDomain': 1 }); // dedup lookup

// --- Soft-delete pre-hook ---
discoveryResultSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const DiscoveryResult = mongoose.model('DiscoveryResult', discoveryResultSchema);
export default DiscoveryResult;
