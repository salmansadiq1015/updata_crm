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
  postalCode: swissPostalCode.allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  canton: canton.allow('', null),
  country: Joi.string().trim().max(2).default('CH'),
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

const providerMetaSchema = Joi.object({
  rating: Joi.number().min(0).max(5).allow(null),
  reviewCount: Joi.number().integer().min(0).allow(null),
  priceLevel: Joi.string().trim().max(40).allow('', null),
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
    q: Joi.string().trim().max(100).allow(''),
    sortBy: Joi.string().valid('createdAt', 'name', 'status').default('createdAt'),
  }),
};

export const leadIdParam = {
  params: Joi.object({ id: objectId.required() }),
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
export const bulkImport = {
  body: Joi.object({
    leads: Joi.array().items(Joi.object({
      clientId: Joi.string().trim().max(128).required(),
      businessName: Joi.string().trim().max(255).required(),
      category: Joi.string().trim().max(120).allow('', null),
      categories: Joi.array().items(Joi.string().trim().max(80)).max(50).default([]),
      placeIdentifier: Joi.string().trim().max(255).allow('', null),
      phone: Joi.string().trim().max(50).allow('', null),
      website: Joi.string().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
      emails: Joi.array().items(Joi.string().email()).max(20).default([]),
      address: Joi.string().trim().max(500).allow('', null),
      street: Joi.string().trim().max(255).allow('', null),
      city: Joi.string().trim().max(120).allow('', null),
      state: Joi.string().trim().max(80).allow('', null),
      postalCode: Joi.string().trim().max(20).allow('', null),
      country: Joi.string().trim().max(100).allow('', null),
      latitude: Joi.number().min(-90).max(90).allow(null),
      longitude: Joi.number().min(-180).max(180).allow(null),
      rating: Joi.number().min(0).max(5).allow(null),
      reviewCount: Joi.number().integer().min(0).allow(null),
      priceLevel: Joi.string().trim().max(40).allow('', null),
      discoveredAt: Joi.date().iso().allow(null),
      searchId: Joi.string().max(128).allow('', null),
    }).unknown(false)).min(1).max(500).required(),
  }),
};

export const duplicates = {
  query: Joi.object({
    name: Joi.string().trim().max(255),
    postalCode: swissPostalCode.allow(''),
    phone: phone.allow(''),
    website: Joi.string().trim().max(500).allow(''),
    placeId: Joi.string().trim().max(255).allow(''),
  }).or('name', 'phone', 'website', 'placeId'),
};
