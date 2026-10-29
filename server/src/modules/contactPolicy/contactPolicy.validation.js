import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { CONTACT_CHANNELS, CONTACT_SOURCES } from './contactPolicy.constants.js';

const hhmm = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const channelLimit = Joi.object({ perDay: Joi.number().integer().min(0).max(100), perWeek: Joi.number().integer().min(0).max(500) });

export const updateSettings = { body: Joi.object({
  enabled: Joi.boolean(),
  maxTouchesPerDay: Joi.number().integer().min(0).max(100),
  maxTouchesPerWeek: Joi.number().integer().min(0).max(500),
  minGapMinutes: Joi.number().integer().min(0).max(10_080),
  channels: Joi.object(Object.fromEntries(CONTACT_CHANNELS.map((c) => [c, channelLimit]))),
  quietHours: Joi.object({ enabled: Joi.boolean(), start: hhmm, end: hhmm }),
}).min(1) };

export const leadParam = { params: Joi.object({ leadId: objectId.required() }) };
export const leadCheck = {
  params: Joi.object({ leadId: objectId.required() }),
  query: Joi.object({ channel: Joi.string().valid(...CONTACT_CHANNELS).required(), campaignId: objectId }),
};
export const campaignSkips = { params: Joi.object({ source: Joi.string().valid(...CONTACT_SOURCES).required(), campaignId: objectId.required() }) };
