import mongoose from 'mongoose';

/**
 * Discovery session — one "Analyze Area" run: the search criteria the user
 * submitted plus the live progress / counts / usage the worker writes back.
 * Single-tenant: scoped by createdBy. Soft-deletable, with a TTL on expiresAt
 * for retention (§4.1 / §5 of LEAD_GENERATION_DESIGN.md).
 */

export const DISCOVERY_SESSION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  FETCHING: 'FETCHING',
  NORMALIZING: 'NORMALIZING',
  DEDUPLICATING: 'DEDUPLICATING',
  MATCHING: 'MATCHING',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
});

export const DISCOVERY_LOCATION_MODE = Object.freeze({
  SEARCH: 'search',
  DRAW: 'draw',
  UPLOAD: 'upload',
});

export const DISCOVERY_AREA_TYPE = Object.freeze({
  RADIUS: 'radius',
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle',
  POLYGON: 'polygon',
});

// GeoJSON Point — coordinates are [lng, lat]. default:undefined on the parent
// path keeps the sub-document absent (and out of any 2dsphere index) until set.
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
);

// GeoJSON Polygon — the user area normalized to a polygon for point-in-polygon
// filtering. coordinates: [ [ [lng,lat], ... ] ] (outer ring first).
const polygonSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: { type: [[[Number]]], default: undefined },
  },
  { _id: false },
);

const businessTypeSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, maxlength: 120 },
    name: { type: String, trim: true, maxlength: 200, default: null },
    providerIncludedType: { type: String, trim: true, maxlength: 120, default: null },
    providerTextQuery: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false },
);

const discoverySessionSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(DISCOVERY_SESSION_STATUS),
      default: DISCOVERY_SESSION_STATUS.DRAFT,
    },
    location: {
      name: { type: String, trim: true, maxlength: 255, default: null },
      mode: { type: String, enum: Object.values(DISCOVERY_LOCATION_MODE), default: DISCOVERY_LOCATION_MODE.SEARCH },
      center: { type: pointSchema, default: undefined },
      placeId: { type: String, trim: true, maxlength: 255, default: null },
      countryCode: { type: String, trim: true, maxlength: 2, default: null },
      country: { type: String, trim: true, maxlength: 100, default: null },
      region: { type: String, trim: true, maxlength: 120, default: null },
      city: { type: String, trim: true, maxlength: 120, default: null },
      formattedAddress: { type: String, trim: true, maxlength: 500, default: null },
    },
    area: {
      type: { type: String, enum: Object.values(DISCOVERY_AREA_TYPE), default: null },
      radiusMeters: { type: Number, default: null },
      geometry: { type: polygonSchema, default: undefined },
      bounds: {
        north: { type: Number, default: null },
        south: { type: Number, default: null },
        east: { type: Number, default: null },
        west: { type: Number, default: null },
      },
      areaSqKm: { type: Number, default: null },
    },
    businessTypes: { type: [businessTypeSchema], default: [] },
    keyword: { type: String, trim: true, maxlength: 120, default: null },
    provider: {
      name: { type: String, trim: true, maxlength: 60, default: 'google_places' },
      version: { type: String, trim: true, maxlength: 60, default: null },
    },
    config: {
      // Deprecated: retained so old sessions still deserialize. The worker does
      // not use a result-count ceiling.
      maxResults: { type: Number, default: null },
      // Deprecated for new sessions. A finite value is still understood by the
      // worker so old sessions can resume with their original behavior.
      maxSearchRequests: { type: Number, default: null },
      maxCoverageCells: { type: Number, default: 100 },
      concurrency: { type: Number, default: 3 },
      detailsOnImport: { type: Boolean, default: true },
    },
    progress: {
      stage: { type: String, default: null },
      percent: { type: Number, default: 0 },
      searchesCompleted: { type: Number, default: 0 },
      searchesTotal: { type: Number, default: 0 },
      resultsDiscovered: { type: Number, default: 0 },
      resultsPersisted: { type: Number, default: 0 },
      rawResults: { type: Number, default: 0 },
      duplicatesRemoved: { type: Number, default: 0 },
      errors: { type: Number, default: 0 },
    },
    counts: {
      discovered: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      existing: { type: Number, default: 0 },
      possibleDuplicates: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    usage: {
      searchRequests: { type: Number, default: 0 },
      detailsRequests: { type: Number, default: 0 },
      geocodeRequests: { type: Number, default: 0 },
    },
    coverage: {
      strategy: { type: String, trim: true, maxlength: 40, default: null },
      state: {
        type: String,
        enum: ['PENDING', 'RUNNING', 'EXHAUSTED', 'PARTIAL', 'CANCELLED'],
        default: 'PENDING',
      },
      providerGuaranteesCompleteness: { type: Boolean, default: false },
      searchesCompleted: { type: Number, default: 0 },
      searchesTotal: { type: Number, default: 0 },
      saturatedRegions: { type: Number, default: 0 },
      subdividedRegions: { type: Number, default: 0 },
      unresolvedRegions: { type: Number, default: 0 },
      reasonCodes: { type: [String], default: [] },
    },
    cancelRequested: { type: Boolean, default: false },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
      retryable: { type: Boolean, default: null },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    // Retention: a TTL index on this field purges stale sessions (§5).
    expiresAt: { type: Date, default: null },
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
discoverySessionSchema.index({ createdBy: 1, createdAt: -1 }); // history list (default)
discoverySessionSchema.index({ createdBy: 1, status: 1, createdAt: -1 }); // filter by status
discoverySessionSchema.index({ status: 1 }); // worker / stale scans
discoverySessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL retention

// --- Soft-delete pre-hook ---
discoverySessionSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const DiscoverySession = mongoose.model('DiscoverySession', discoverySessionSchema);
export default DiscoverySession;
