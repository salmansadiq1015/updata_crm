import Joi from 'joi';
import { objectId, cursorPagination } from '../../shared/validation/commonSchemas.js';

/**
 * Password must be at least 10 chars with 1 uppercase, 1 lowercase, 1 digit, 1 special char.
 */
const passwordSchema = Joi.string()
  .min(10)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character',
    'string.min': 'Password must be at least 10 characters',
  });

export const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
    password: Joi.string().required(),
  }),
};

export const refreshSchema = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

export const resetRequestSchema = {
  body: Joi.object({
    email: Joi.string().email().required().lowercase().trim(),
  }),
};

export const resetConfirmSchema = {
  body: Joi.object({
    token: Joi.string().required(),
    password: passwordSchema,
  }),
};

export const activateSchema = {
  body: Joi.object({
    token: Joi.string().required(),
    password: passwordSchema,
  }),
};

export const changePasswordSchema = {
  body: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: passwordSchema,
  }),
};

export const sessionIdParamSchema = {
  params: Joi.object({
    id: Joi.string().required(),
  }),
};

export const auditQuerySchema = {
  query: cursorPagination.keys({
    userId: objectId,
    eventType: Joi.string().trim(),
    result: Joi.string().valid('success', 'failure'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    module: Joi.string().trim(),
    email: Joi.string().trim(),
    search: Joi.string().trim().max(200),
  }),
};

export const auditExportSchema = {
  query: Joi.object({
    format: Joi.string().valid('csv', 'json').default('json'),
    userId: objectId,
    eventType: Joi.string().trim(),
    result: Joi.string().valid('success', 'failure'),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    module: Joi.string().trim(),
    email: Joi.string().trim(),
    search: Joi.string().trim().max(200),
  }),
};

export { passwordSchema };
