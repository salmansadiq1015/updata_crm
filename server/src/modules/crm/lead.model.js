import mongoose from 'mongoose';
import { canonicalizeLeadAddress } from './leadGeography.js';
import { QUALIFICATION_ANSWER_SOURCES, TRANSCRIPT_QUOTE_MAX } from './leadQualification.constants.js';

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

// Pointer into an AI call transcript: the call, the turn index and/or offset,
// and the verbatim quote the value rests on.
const transcriptRefSchema = new mongoose.Schema(
  {
    callRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
    turnIndex: { type: Number, min: 0, default: null },
    startMs: { type: Number, min: 0, default: null },
    quote: { type: String, maxlength: TRANSCRIPT_QUOTE_MAX, default: null },
  },
  { _id: false },
);

const leadQualificationFieldSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, trim: true, maxlength: 200, default: null },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['answered', 'unknown', 'refused', 'not_applicable'], required: true },
    source: { type: String, enum: QUALIFICATION_ANSWER_SOURCES, default: 'user' },
    evidence: { type: String, maxlength: 2000, default: null },
    communicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCommunication', default: null },
    // Evidence links (Leads-A answer history): the AI call / SIM SMS message the
    // value came from and, for calls, the transcript turn that supports it.
    callRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
    smsMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsMessage', default: null },
    transcriptRef: { type: transcriptRefSchema, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const leadQualificationSchema = new mongoose.Schema(
  {
    fields: { type: [leadQualificationFieldSchema], default: [] },
    updatedAt: { type: Date, default: null },
    // Stored alongside the current values so a version and its update commit together.
    // Excluded from ordinary lead reads; the qualification history endpoint exposes it.
    history: { type: [new mongoose.Schema({
      fieldKey: { type: String, required: true },
      previous: { type: leadQualificationFieldSchema, default: null },
      current: { type: leadQualificationFieldSchema, required: true },
      confidence: { type: Number, min: 0, max: 1, default: null },
      communicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadCommunication', default: null },
      // Provenance of this version (Leads-A answer history). Absent on versions
      // written before these fields existed — the API reports them as unknown.
      source: { type: String, enum: [...QUALIFICATION_ANSWER_SOURCES, null], default: null },
      callRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
      smsMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsMessage', default: null },
      transcriptRef: { type: transcriptRefSchema, default: null },
      // A user correction points at the version it corrects and must say why.
      correctionOf: { type: mongoose.Schema.Types.ObjectId, default: null },
      reason: { type: String, maxlength: 1000, default: null },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      changedAt: { type: Date, required: true },
    })], default: [], select: false },
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
      // put foreign leads (e.g. Pakistan, Morocco) in the wrong country. Every
      // creation path now supplies a resolved country or leaves it null, so an
      // unknown location is never silently classified as Switzerland.
      country: { type: String, trim: true, maxlength: 2, default: null },
      // Full provider-supplied address string, kept verbatim for display.
      formatted: { type: String, trim: true, maxlength: 500, default: null },
      // Server-owned canonical hierarchy. User/provider strings above remain
      // available for display/audit; filters and parent relationships use these
      // stable identifiers so spelling variants cannot create duplicate places.
      geography: {
        countryId: { type: String, trim: true, maxlength: 80, default: null },
        countryCode: { type: String, trim: true, maxlength: 2, default: null },
        countryName: { type: String, trim: true, maxlength: 120, default: null },
        cityId: { type: String, trim: true, maxlength: 80, default: null },
        cityName: { type: String, trim: true, maxlength: 120, default: null },
        areaId: { type: String, trim: true, maxlength: 80, default: null },
        areaName: { type: String, trim: true, maxlength: 120, default: null },
        parentLocationId: { type: String, trim: true, maxlength: 80, default: null },
        locationType: {
          type: String,
          enum: ['country', 'city', 'district', 'arrondissement', 'borough', 'neighborhood', null],
          default: null,
        },
        source: { type: String, trim: true, maxlength: 60, default: 'unknown' },
        externalPlaceId: { type: String, trim: true, maxlength: 255, default: null },
        confidence: { type: String, enum: ['canonical', 'ambiguous', 'unresolved'], default: 'unresolved' },
        reviewRequired: { type: Boolean, default: false },
        issues: { type: [String], default: [] },
      },
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
    // Assignment + first-response SLA (leadAssignment.service / leadSla.service).
    // slaStatus: none (no owner/SLA) → pending → met | overdue → late (answered
    // after the deadline). escalationLevel counts escalations of the current SLA.
    assignedAt: { type: Date, default: null },
    assignmentSource: { type: String, enum: ['manual', 'auto', 'import', null], default: null },
    firstResponseDueAt: { type: Date, default: null },
    firstRespondedAt: { type: Date, default: null },
    firstResponseChannel: { type: String, maxlength: 40, default: null },
    slaStatus: { type: String, enum: ['none', 'pending', 'met', 'overdue', 'late'], default: 'none' },
    slaBreachedAt: { type: Date, default: null },
    escalationLevel: { type: Number, min: 0, default: 0 },
    lastEscalatedAt: { type: Date, default: null },
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
    // Merged qualification answers (leadQualification.constants.js schema),
    // written by the mobile call/SMS wrap-up. Each field records which
    // communication set it and who confirmed it. Absent until first written.
    qualification: { type: leadQualificationSchema, default: null },
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
    // --- Lead quality (leadScoring.engine.js / leadMerge.service.js) ---
    // Compact copy of the last deterministic score; the full evidence-backed
    // breakdown is served by GET /crm/leads/:id/score. Absent until scored.
    score: {
      type: new mongoose.Schema({
        value: { type: Number, min: 0, max: 100, required: true },
        band: { type: String, enum: ['hot', 'warm', 'cold', 'unscored'], required: true },
        version: { type: Number, required: true },
        engineVersion: { type: String, maxlength: 40, default: null },
        computedAt: { type: Date, required: true },
        disqualified: { type: Boolean, default: false },
        factors: {
          type: [new mongoose.Schema({
            key: { type: String, maxlength: 60, required: true },
            points: { type: Number, required: true },
            maxPoints: { type: Number, required: true },
          }, { _id: false })],
          default: [],
        },
      }, { _id: false }),
      default: undefined,
    },
    // Denormalized sort key for the list (cursor pagination needs a top-level,
    // always-numeric field): the score value, or -1 while the lead is unscored.
    scoreValue: { type: Number, default: -1 },
    // Merge bookkeeping. A merged-away lead is soft-deleted with mergedInto set;
    // the survivor lists every lead merged into it (timeline reads this).
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    mergedAt: { type: Date, default: null },
    mergedLeadIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Lead', default: [] },
    // Short-lived lock held by an in-flight merge/undo (never serialized).
    mergeLock: {
      type: new mongoose.Schema({
        mergeId: { type: mongoose.Schema.Types.ObjectId, required: true },
        token: { type: String, maxlength: 64, required: true },
        until: { type: Date, required: true },
      }, { _id: false }),
      default: null,
      select: false,
    },
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
// SLA sweep: pending/overdue leads by deadline (leadSla.service sweep).
leadSchema.index({ slaStatus: 1, firstResponseDueAt: 1 }, { name: 'lead_sla_sweep' });
// Cascading Leads filters use the actual address hierarchy. Keeping soft-delete
// first also helps the filter-options facet, which only exposes live leads.
leadSchema.index({ isDeleted: 1, 'address.country': 1, 'address.city': 1, 'address.area': 1 });
leadSchema.index({
  isDeleted: 1,
  'address.geography.countryId': 1,
  'address.geography.cityId': 1,
  'address.geography.areaId': 1,
}, { name: 'lead_canonical_geography_filters' });
// Import idempotency: a google-sourced place may back at most one lead.
leadSchema.index(
  { 'sourceMetadata.googlePlaceId': 1 },
  { unique: true, partialFilterExpression: { source: 'google_places' } },
);
leadSchema.index({ normalizedPhone: 1 }); // dedup ladder
leadSchema.index({ websiteDomain: 1 }); // dedup ladder
leadSchema.index({ name: 1, 'address.postalCode': 1 }); // dedup ladder
leadSchema.index({ location: '2dsphere' }); // geo dedup / map
leadSchema.index({ email: 1 }); // duplicate detection
leadSchema.index({ scoreValue: -1, _id: -1 }); // sort by score (no isDeleted prefix: it would hijack _id $in plans)
leadSchema.index({ 'score.band': 1 }); // band filter
leadSchema.index({ mergedInto: 1 }, { partialFilterExpression: { mergedInto: { $type: 'objectId' } } });
leadSchema.index(
  { name: 'text', 'address.city': 'text', email: 'text' },
  { weights: { name: 10, email: 5, 'address.city': 2 } },
); // search

// Model-level safety net for direct writes in scripts/tests. Application write
// paths also canonicalize in the service so findOneAndUpdate/insertMany receive
// the same hierarchy (document middleware does not cover those operations).
leadSchema.pre('validate', function canonicalizeAddress() {
  const address = this.address?.toObject?.({ depopulate: true }) ?? this.address ?? {};
  this.address = canonicalizeLeadAddress(address, { source: this.source || 'model' });
});

// --- Soft-delete pre-hook ---
leadSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
