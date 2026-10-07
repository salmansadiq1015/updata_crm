import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

/**
 * Validation schemas for the extension connect endpoints. `validate` strips
 * unknown fields, so the redeem route cannot be used to smuggle extra inputs.
 */

export const redeemPairing = {
  body: Joi.object({
    // 64 hex chars from generateRandomString(32); accept a safe upper bound.
    grant: Joi.string().trim().pattern(/^[a-f0-9]{32,128}$/).required().messages({
      'string.pattern.base': 'Invalid pairing grant.',
    }),
    instanceId: Joi.string().trim().max(128).required(),
    extensionVersion: Joi.string().trim().max(32).allow('', null),
  }),
};

export const heartbeat = {
  body: Joi.object({
    extensionVersion: Joi.string().trim().max(32).allow('', null),
  }),
};

export const disconnect = {
  body: Joi.object({
    // Omit to disconnect every browser the user has linked.
    connectionId: objectId.allow(null),
  }),
};

export const listImports = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};
