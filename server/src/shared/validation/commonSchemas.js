import Joi from 'joi';
import { isValidIban } from './swissPayment.js';

/**
 * Reusable Joi schemas for common patterns.
 * Modules compose these into endpoint-specific schemas.
 */

// MongoDB ObjectId (24-char hex)
export const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).messages({
  'string.pattern.base': '{#label} must be a valid ObjectId',
});

// Cursor-based pagination
export const cursorPagination = Joi.object({
  cursor: Joi.string().allow(''),
  limit: Joi.number().integer().min(1).max(100).default(25),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// Offset-based pagination
export const offsetPagination = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// Date range filter
export const dateRange = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),
});

// Common ID param
export const idParam = Joi.object({
  id: objectId.required(),
});

export default {
  objectId,
  cursorPagination,
  offsetPagination,
  dateRange,
  idParam,
};

/**
 * An IBAN whose check digits add up.
 *
 * A shape pattern accepts CH9300762011623852958 — one digit off a real
 * account — and the payment then leaves for an account that does not exist.
 * The mod-97 checksum exists to catch exactly that, so it runs at the moment
 * the number is written rather than only when somebody later looks at it.
 */
export const iban = Joi.string().trim().max(34).custom((value, helpers) => {
  if (!value) return value;
  return isValidIban(value) ? value.replace(/[\s-]/g, '').toUpperCase() : helpers.error('any.invalid');
}, 'IBAN checksum').messages({
  'any.invalid': 'Die IBAN ist ungültig — die Prüfziffer stimmt nicht.',
});
