import Joi from 'joi';

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
