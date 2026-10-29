import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { LEAD_TYPE, LEAD_STATUS, LEAD_SOURCE } from './lead.model.js';

/**
 * Validation schemas for lead import/export (§34).
 *
 * The POST /import route does NOT use a Joi body schema: multipart bodies plus
 * Joi `stripUnknown` would drop the multer file field. The `mode` field is
 * validated inside the controller instead (see IMPORT_MODES below).
 */

const LEAD_TYPES = Object.values(LEAD_TYPE);
const LEAD_STATUSES = Object.values(LEAD_STATUS);
const LEAD_SOURCES = Object.values(LEAD_SOURCE);
const canonicalLocationId = Joi.string().trim().max(80)
  .pattern(/^(country:[A-Z]{2}|(?:city|area):[a-f0-9]{24})$/);

// Accepted import modes — mirrored by the controller's own `mode` check.
export const IMPORT_MODES = Object.freeze(['new', 'skip', 'update']);

export const exportLeads = {
  query: Joi.object({
    format: Joi.string().valid('csv', 'xlsx', 'pdf').default('csv'),
    status: Joi.string().valid(...LEAD_STATUSES),
    source: Joi.string().valid(...LEAD_SOURCES),
    assignedTo: objectId,
    type: Joi.string().valid(...LEAD_TYPES),
    country: Joi.string().trim().length(2).uppercase(),
    city: Joi.string().trim().max(120),
    area: Joi.string().trim().max(120),
    countryId: canonicalLocationId,
    cityId: canonicalLocationId,
    areaId: canonicalLocationId,
    businessType: Joi.string().trim().max(120),
    scoreBand: Joi.string().valid('hot', 'warm', 'cold', 'unscored'),
    q: Joi.string().trim().max(100).allow(''),
  }),
};

export const importTemplate = {
  query: Joi.object({
    format: Joi.string().valid('csv', 'xlsx').default('csv'),
  }),
};

export default { exportLeads, importTemplate, IMPORT_MODES };
