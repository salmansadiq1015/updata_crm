import Joi from 'joi';

/**
 * Validation for the cached location-proxy endpoints (Module 15):
 *   POST /location/geocode      — forward geocode an address/place string.
 *   POST /location/autocomplete — location search-box suggestions.
 *
 * Kept separate from discovery.validation.js (which is already built and must not
 * be edited). Unknown fields are stripped by the validate() middleware.
 */

const latitude = Joi.number().min(-90).max(90);
const longitude = Joi.number().min(-180).max(180);

const centerSchema = Joi.object({
  lat: latitude.required(),
  lng: longitude.required(),
});

export const geocode = {
  body: Joi.object({
    query: Joi.string().trim().min(1).max(255).required(),
  }),
};

export const autocomplete = {
  body: Joi.object({
    input: Joi.string().trim().min(1).max(255).required(),
    sessionToken: Joi.string().trim().max(255).allow('', null),
    center: centerSchema.optional(),
  }),
};

export default { geocode, autocomplete };
