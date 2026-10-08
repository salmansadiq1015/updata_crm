import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import { SWISS_CANTONS, SWISS_POSTAL_CODE_PATTERN, PHONE_PATTERN } from './crm.constants.js';
import { LEAD_TYPE, LEAD_STATUS, LEAD_SOURCE } from './lead.model.js';

const LEAD_TYPES = Object.values(LEAD_TYPE);
const LEAD_STATUSES = Object.values(LEAD_STATUS);
const LEAD_SOURCES = Object.values(LEAD_SOURCE);

const swissPostalCode = Joi.string().trim().max(20)
  .pattern(SWISS_POSTAL_CODE_PATTERN)
  .messages({ 'string.pattern.base': 'Swiss postal code must be exactly 4 digits (1000-9999)' });

const canton = Joi.string().trim()
  .valid(...SWISS_CANTONS)
  .messages({ 'any.only': 'Must be a valid Swiss canton code (e.g., ZH, BE, GE)' });

const phone = Joi.string().trim().max(50)
  .pattern(PHONE_PATTERN)
  .messages({ 'string.pattern.base': 'Please enter a valid phone number (e.g., +41 44 123 45 67)' });

// GeoJSON Point, coordinates [lng, lat] with sane ranges.
const geoPoint = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  coordinates: Joi.array().ordered(
    Joi.number().min(-180).max(180).required(), // lng
    Joi.number().min(-90).max(90).required(), // lat
  ).length(2).required(),
});

// The manual create/edit form sends a flat { lat, lng }. Accept it alongside
// GeoJSON (imports / discovery send GeoJSON); lead.service converts { lat, lng }
// → { type: 'Point', coordinates: [lng, lat] } before persisting.
const latLngPoint = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

const locationInput = Joi.alternatives().try(geoPoint, latLngPoint);

const addressSchema = Joi.object({
  street: Joi.string().trim().max(255).allow('', null),
  addressSupplement: Joi.string().trim().max(255).allow('', null),
  area: Joi.string().trim().max(120).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  canton: canton.allow('', null),
  // Non-Swiss state/province; the Swiss sub-national admin stays in `canton`.
  region: Joi.string().trim().max(120).allow('', null),
  country: Joi.string().trim().uppercase().max(2).default('CH'),
  // Swiss leads keep the strict 4-digit rule; foreign leads accept any code so a
  // non-Swiss lead is no longer rejected for a non-Swiss postal format.
  postalCode: Joi.when('country', {
    is: Joi.string().valid('CH'),
    then: swissPostalCode.allow('', null),
    otherwise: Joi.string().trim().max(20).allow('', null),
  }),
  formatted: Joi.string().trim().max(500).allow('', null),
});

const discoveryBounds = Joi.object({
  north: Joi.number().min(-90).max(90).required(),
  south: Joi.number().min(-90).max(90).required(),
  east: Joi.number().min(-180).max(180).required(),
  west: Joi.number().min(-180).max(180).required(),
});

const discoveryLocation = Joi.object({
  name: Joi.string().trim().max(255).allow('', null),
  mode: Joi.string().valid('search', 'draw', 'upload').allow(null),
  center: geoPoint.allow(null),
  placeId: Joi.string().trim().max(255).allow('', null),
  countryCode: Joi.string().trim().uppercase().length(2).allow('', null),
  country: Joi.string().trim().max(100).allow('', null),
  region: Joi.string().trim().max(120).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  formattedAddress: Joi.string().trim().max(500).allow('', null),
}).allow(null);

const discoveryArea = Joi.object({
  type: Joi.string().valid('radius', 'circle', 'rectangle', 'polygon').allow(null),
  radiusMeters: Joi.number().positive().max(50000).allow(null),
  areaSqKm: Joi.number().min(0).allow(null),
  bounds: discoveryBounds.allow(null),
  geometry: Joi.object({
    type: Joi.string().valid('Polygon').required(),
    coordinates: Joi.array().items(
      Joi.array().items(
        Joi.array().ordered(
          Joi.number().min(-180).max(180).required(),
          Joi.number().min(-90).max(90).required(),
        ).length(2),
      ),
    ),
  }).allow(null),
}).allow(null);

const discoverySearchCoordinates = Joi.object({
  cellId: Joi.string().trim().max(120).allow('', null),
  depth: Joi.number().integer().min(0).allow(null),
  center: latLngPoint.allow(null),
  radiusMeters: Joi.number().positive().max(50000).allow(null),
  bounds: discoveryBounds.allow(null),
}).allow(null);

const discoveryBusinessType = Joi.alternatives().try(
  Joi.string().trim().max(120),
  Joi.object({
    id: Joi.string().trim().max(120).required(),
    name: Joi.string().trim().max(200).allow('', null),
    providerIncludedType: Joi.string().trim().max(120).allow('', null),
    providerTextQuery: Joi.string().trim().max(200).allow('', null),
  }),
);

const sourceMetadataSchema = Joi.object({
  googlePlaceId: Joi.string().trim().max(255).allow('', null),
  discoverySessionId: objectId.allow(null),
  discoveryResultId: objectId.allow(null),
  businessType: Joi.string().trim().max(120).allow('', null),
  keyword: Joi.string().trim().max(120).allow('', null),
  discoveryLocation,
  discoveryArea,
  discoverySearchCoordinates,
  discoveryBusinessTypes: Joi.array().items(discoveryBusinessType).max(50),
  discoveredAt: Joi.date().iso().allow(null),
});

const ratingDistributionSchema = Joi.object({
  one: Joi.number().integer().min(0),
  two: Joi.number().integer().min(0),
  three: Joi.number().integer().min(0),
  four: Joi.number().integer().min(0),
  five: Joi.number().integer().min(0),
}).allow(null);

const openingHoursSchema = Joi.alternatives().try(
  Joi.string().trim().max(2000),
  Joi.array().items(Joi.string().trim().max(300)).max(20),
).allow(null);

const leadPhotosSchema = Joi.array().items(Joi.object({
  url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).required(),
  source: Joi.string().trim().max(60).allow('', null),
  attribution: Joi.string().trim().max(255).allow('', null),
}).unknown(true)).max(12);

const providerMetaSchema = Joi.object({
  rating: Joi.number().min(0).max(5).allow(null),
  reviewCount: Joi.number().integer().min(0).allow(null),
  priceLevel: Joi.string().trim().max(40).allow('', null),
  // Per-star histogram — only when the provider supplied it; never fabricated.
  ratingDistribution: ratingDistributionSchema,
  businessStatus: Joi.string().trim().max(60).allow('', null),
  openingHours: openingHoursSchema,
  photos: leadPhotosSchema,
  mapsUrl: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(1000).allow('', null),
});

export const createLead = {
  body: Joi.object({
    name: Joi.string().trim().max(255).required(),
    type: Joi.string().valid(...LEAD_TYPES).default(LEAD_TYPE.BUSINESS),
    status: Joi.string().valid(...LEAD_STATUSES).default(LEAD_STATUS.NEW),
    address: addressSchema.default({}),
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(500).allow('', null),
    location: locationInput.allow(null),
    providerMeta: providerMetaSchema,
    source: Joi.string().valid(...LEAD_SOURCES).default(LEAD_SOURCE.MANUAL),
    sourceMetadata: sourceMetadataSchema,
    assignedTo: objectId.allow(null),
    notes: Joi.string().max(5000).allow('', null),
    tags: Joi.array().items(Joi.string().trim().max(50)).default([]),
  }),
};

export const updateLead = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(255),
    type: Joi.string().valid(...LEAD_TYPES),
    status: Joi.string().valid(...LEAD_STATUSES),
    address: addressSchema,
    phone: phone.allow('', null),
    mobile: phone.allow('', null),
    email: Joi.string().email().trim().max(255).allow('', null),
    website: Joi.string().uri({ scheme: ['http', 'https'] }).trim().max(500).allow('', null),
    location: locationInput.allow(null),
    providerMeta: providerMetaSchema,
    assignedTo: objectId.allow(null),
    notes: Joi.string().max(5000).allow('', null),
    tags: Joi.array().items(Joi.string().trim().max(50)),
  }).min(1),
};

export const listLeads = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...LEAD_STATUSES),
    assignedTo: objectId,
    source: Joi.string().valid(...LEAD_SOURCES),
    type: Joi.string().valid(...LEAD_TYPES),
    city: Joi.string().trim().max(120),
    businessType: Joi.string().trim().max(120),
    q: Joi.string().trim().max(100).allow(''),
    sortBy: Joi.string().valid('createdAt', 'name', 'status').default('createdAt'),
  }),
};

// Map view: same filter surface as the list, but no cursor pagination. `limit`
// caps the returned set (the repository also enforces a hard ceiling).
export const mapLeads = {
  query: Joi.object({
    status: Joi.string().valid(...LEAD_STATUSES),
    assignedTo: objectId,
    source: Joi.string().valid(...LEAD_SOURCES),
    type: Joi.string().valid(...LEAD_TYPES),
    city: Joi.string().trim().max(120),
    businessType: Joi.string().trim().max(120),
    q: Joi.string().trim().max(100).allow(''),
    limit: Joi.number().integer().min(1).max(5000),
  }),
};

export const leadIdParam = {
  params: Joi.object({ id: objectId.required() }),
};

// Bulk delete: one request with all selected ids. Duplicates are allowed here
// (collapsed server-side) so a repeated selection never 400s the whole batch;
// capped so a single request can't ask to touch an unbounded set.
export const bulkDelete = {
  body: Joi.object({
    leadIds: Joi.array().items(objectId).min(1).max(1000).required(),
  }),
};

// Bulk (re)assign the selected leads in one request. `assignedTo: null` unassigns.
export const bulkAssign = {
  body: Joi.object({
    leadIds: Joi.array().items(objectId).min(1).max(1000).required(),
    assignedTo: objectId.allow(null).default(null),
  }),
};

export const convertLead = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    assignedTo: objectId.allow(null),
    // Optional additive note recorded on the created Customer (§4.3).
    note: Joi.string().max(5000).allow('', null),
  }).default({}),
};

export const logWhatsApp = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    // Optional prefilled chat text; the client appends it to the wa.me link.
    message: Joi.string().allow('').max(2000).optional(),
  }),
};

export const leadContactLog = {
  params: Joi.object({ id: objectId.required() }),
};

export const enrichLead = {
  params: Joi.object({ id: objectId.required() }),
};

export const geocodeLead = {
  params: Joi.object({ id: objectId.required() }),
};

export const enrichBulk = {
  body: Joi.object({
    leadIds: Joi.array().items(objectId).min(1).max(500)
      .required()
      .messages({ 'array.max': 'A bulk enrichment run accepts at most {#limit} leads' }),
  }),
};

export const enrichJobIdParam = {
  params: Joi.object({ jobId: objectId.required() }),
};

// Authenticated extension batches. The server deliberately accepts the
// client correlation id only for reporting; ownership is always req.user._id.
//
// This gate is intentionally LENIENT per field: Maps-sourced rows are messy
// (a phone can hold "Café X · Visited link", a website can lack a scheme, a
// rating can be absent). Over-long strings are `.truncate()`d and unparseable
// numbers/dates `.failover(null)` rather than rejected, so ONE bad row can
// never 400 the whole batch. The real per-field validation + normalisation
// happens per record in `leadImportExport.service.importExtensionLeads`, which
// isolates failures to the individual row (spec: partial failures must not
// fail the whole import). Caps remain for payload safety.
export const bulkImport = {
  body: Joi.object({
    leads: Joi.array().items(Joi.object({
      clientId: Joi.string().trim().max(128).truncate(true).allow('', null),
      businessName: Joi.string().trim().max(300).truncate(true).allow('', null),
      category: Joi.string().trim().max(200).truncate(true).allow('', null),
      categories: Joi.array().items(Joi.string().trim().max(120).truncate(true)).max(50).default([]),
      placeIdentifier: Joi.string().trim().max(300).truncate(true).allow('', null),
      phone: Joi.string().trim().max(120).truncate(true).allow('', null),
      website: Joi.string().trim().max(600).truncate(true).allow('', null),
      emails: Joi.array().items(Joi.string().trim().max(254).truncate(true)).max(30).default([]),
      address: Joi.string().trim().max(600).truncate(true).allow('', null),
      formattedAddress: Joi.string().trim().max(600).truncate(true).allow('', null),
      street: Joi.string().trim().max(300).truncate(true).allow('', null),
      area: Joi.string().trim().max(200).truncate(true).allow('', null),
      city: Joi.string().trim().max(200).truncate(true).allow('', null),
      state: Joi.string().trim().max(160).truncate(true).allow('', null),
      region: Joi.string().trim().max(200).truncate(true).allow('', null),
      postalCode: Joi.string().trim().max(40).truncate(true).allow('', null),
      country: Joi.string().trim().max(120).truncate(true).allow('', null),
      latitude: Joi.number().allow(null).failover(null),
      longitude: Joi.number().allow(null).failover(null),
      rating: Joi.number().allow(null).failover(null),
      reviewCount: Joi.number().allow(null).failover(null),
      // Real per-star counts the extension scraped from the place page, or null.
      ratingDistribution: Joi.object().unknown(true).allow(null).failover(null),
      priceLevel: Joi.string().trim().max(60).truncate(true).allow('', null),
      businessStatus: Joi.string().trim().max(80).truncate(true).allow('', null),
      openingHours: Joi.alternatives().try(
        Joi.string().trim().max(2000).truncate(true),
        Joi.array().items(Joi.string().trim().max(300).truncate(true)).max(20),
      ).allow(null).failover(null),
      photos: Joi.array().items(Joi.alternatives().try(
        Joi.string().trim().max(2000).truncate(true),
        Joi.object().unknown(true),
      )).max(20).default([]),
      googleMapsUrl: Joi.string().trim().max(1000).truncate(true).allow('', null),
      discoveredAt: Joi.date().iso().allow('', null).failover(null),
      searchId: Joi.string().trim().max(128).truncate(true).allow('', null),
    }).unknown(true)).min(1).max(500).required(),
    // Optional import-run tracking (reporting only; ownership is always the
    // authenticated user). Batches of one run share `importId`; `importTotal`
    // is the run's expected row count and `importFinal` marks its last batch.
    importId: Joi.string().trim().max(128).truncate(true).allow('', null),
    importTotal: Joi.number().integer().min(0).allow(null).failover(null),
    importFinal: Joi.boolean().allow(null).failover(null),
  }),
};

export const duplicates = {
  query: Joi.object({
    name: Joi.string().trim().max(255),
    // Accept any postal format — leads can be non-Swiss.
    postalCode: Joi.string().trim().max(20).allow(''),
    phone: phone.allow(''),
    website: Joi.string().trim().max(500).allow(''),
    placeId: Joi.string().trim().max(255).allow(''),
  }).or('name', 'phone', 'website', 'placeId'),
};
