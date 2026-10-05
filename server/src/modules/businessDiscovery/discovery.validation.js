import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';
import {
  DISCOVERY_SESSION_STATUS,
  DISCOVERY_LOCATION_MODE,
  DISCOVERY_AREA_TYPE,
} from './discoverySession.model.js';
import {
  RESULT_MATCHING_STATUS,
  RESULT_IMPORT_STATUS,
} from './discoveryResult.model.js';
import {
  LEAD_IMPORT_MODE,
  LEAD_IMPORT_SELECTION_KIND,
} from './leadImportJob.model.js';

const SESSION_STATUSES = Object.values(DISCOVERY_SESSION_STATUS);
const LOCATION_MODES = Object.values(DISCOVERY_LOCATION_MODE);
const AREA_TYPES = Object.values(DISCOVERY_AREA_TYPE);
const IMPORT_MODES = Object.values(LEAD_IMPORT_MODE);
const SELECTION_KINDS = Object.values(LEAD_IMPORT_SELECTION_KIND);

// Geometry sanity bounds (§7: never an unbounded area / ring).
const MAX_RADIUS_METERS = 50000; // Google searchNearby radius cap
const MAX_RING_POINTS = 1000; // bounded polygon ring
const MAX_RINGS = 20; // outer ring + holes
const latitude = Joi.number().min(-90).max(90);
const longitude = Joi.number().min(-180).max(180);

const centerSchema = Joi.object({
  lat: latitude.required(),
  lng: longitude.required(),
});

const boundsSchema = Joi.object({
  north: latitude.required(),
  south: latitude.required(),
  east: longitude.required(),
  west: longitude.required(),
});

// GeoJSON Polygon — coordinates [ [ [lng,lat], ... ] ]. A valid linear ring is a
// closed loop of at least 4 positions; both ring count and length are bounded.
const positionSchema = Joi.array().ordered(
  longitude.required(),
  latitude.required(),
).length(2);

const linearRing = Joi.array().items(positionSchema).min(4).max(MAX_RING_POINTS);

const polygonGeometry = Joi.object({
  type: Joi.string().valid('Polygon').required(),
  coordinates: Joi.array().items(linearRing).min(1).max(MAX_RINGS).required(),
});

const locationSchema = Joi.object({
  name: Joi.string().trim().max(255).allow('', null),
  mode: Joi.string().valid(...LOCATION_MODES).required(),
  center: centerSchema.required(),
  placeId: Joi.string().trim().max(255).allow('', null),
  countryCode: Joi.string().trim().uppercase().length(2).allow('', null),
  country: Joi.string().trim().max(100).allow('', null),
  region: Joi.string().trim().max(120).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  formattedAddress: Joi.string().trim().max(500).allow('', null),
});

const areaSchema = Joi.object({
  type: Joi.string().valid(...AREA_TYPES).required(),
  radiusMeters: Joi.number().positive().max(MAX_RADIUS_METERS)
    .when('type', {
      is: Joi.valid(DISCOVERY_AREA_TYPE.RADIUS, DISCOVERY_AREA_TYPE.CIRCLE),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  geometry: polygonGeometry.when('type', {
    is: DISCOVERY_AREA_TYPE.POLYGON,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  bounds: boundsSchema.when('type', {
    is: DISCOVERY_AREA_TYPE.RECTANGLE,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
});

// A business type is either a catalog entry {id, name} or a free-text custom type.
const businessTypeItem = Joi.alternatives().try(
  Joi.object({
    id: Joi.string().trim().max(120).required(),
    name: Joi.string().trim().max(200).allow('', null),
  }),
  Joi.string().trim().min(1).max(120),
);

const optionsSchema = Joi.object({
  // Accepted and stripped for backward compatibility. Result-count truncation
  // is intentionally unsupported.
  maxResults: Joi.any().strip(),
  // Accepted and stripped for old clients. New discovery runs do not stop at
  // an application-defined request count; provider failures are surfaced as
  // partial coverage instead.
  maxSearchRequests: Joi.any().strip(),
}).default({});

export const createSession = {
  body: Joi.object({
    location: locationSchema.required(),
    area: areaSchema.required(),
    businessTypes: Joi.array().items(businessTypeItem).min(1).max(50).required(),
    keyword: Joi.string().trim().max(120).allow('', null),
    options: optionsSchema,
  }),
};

export const listSessions = {
  query: cursorPagination.keys({
    status: Joi.string().valid(...SESSION_STATUSES),
    q: Joi.string().trim().max(100).allow(''),
    sortBy: Joi.string().valid('createdAt', 'updatedAt').default('createdAt'),
  }),
};

export const listResults = {
  query: cursorPagination.keys({
    search: Joi.string().trim().max(120).allow(''),
    matchingStatus: Joi.string().valid(...Object.values(RESULT_MATCHING_STATUS)),
    importStatus: Joi.string().valid(...Object.values(RESULT_IMPORT_STATUS)),
    hasPhone: Joi.boolean(),
    hasWebsite: Joi.boolean(),
    minRating: Joi.number().min(0).max(5),
    sortBy: Joi.string().valid('discoveredAt', 'rating', 'reviewCount', 'business.name').default('discoveredAt'),
  }),
};

export const listMarkers = {
  query: Joi.object({
    cursor: Joi.string().allow('', null),
    limit: Joi.number().integer().min(1).max(1000).default(500),
  }),
};

export const importBody = {
  body: Joi.object({
    mode: Joi.string().valid(...IMPORT_MODES).required(),
    selection: Joi.object({
      kind: Joi.string().valid(...SELECTION_KINDS).required(),
      resultIds: Joi.array().items(objectId).max(1000).when('kind', {
        is: LEAD_IMPORT_SELECTION_KIND.SELECTED,
        then: Joi.array().min(1).required(),
        otherwise: Joi.forbidden(),
      }),
    }).required(),
  }),
};

export const importPreview = {
  query: Joi.object({
    mode: Joi.string().valid(...IMPORT_MODES).required(),
  }),
};

export const sessionIdParam = {
  params: Joi.object({ id: objectId.required() }),
};

// Result-level routes (e.g. GET /sessions/:id/results/:resultId, Add One) need
// the result id validated too; kept here so routes compose from one place.
export const resultIdParam = {
  params: Joi.object({ resultId: objectId.required() }),
};
