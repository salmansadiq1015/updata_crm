import Joi from 'joi';
import { objectId, cursorPagination, idParam } from '../../shared/validation/commonSchemas.js';

const schedulingCapabilitySchema = Joi.array().items(Joi.string().trim().max(80)).max(50);
const assignmentTypes = ['manager', 'team'];

export const createUserSchema = {
  body: Joi.object({
    email: Joi.string().email().required().lowercase().trim().max(255),
    firstName: Joi.string().required().trim().max(100),
    lastName: Joi.string().required().trim().max(100),
    roleId: objectId.required(),
    language: Joi.string().valid('de', 'en', 'fr', 'it').default('de'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
    schedulingSkills: schedulingCapabilitySchema,
    schedulingCertifications: schedulingCapabilitySchema,
  }),
};

export const updateUserSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().max(255),
    firstName: Joi.string().trim().max(100),
    lastName: Joi.string().trim().max(100),
    roleId: objectId,
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
    status: Joi.string().valid('active', 'deactivated', 'locked'),
    schedulingSkills: schedulingCapabilitySchema,
    schedulingCertifications: schedulingCapabilitySchema,
  }),
};

export const updateMeSchema = {
  body: Joi.object({
    firstName: Joi.string().trim().max(100),
    lastName: Joi.string().trim().max(100),
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    phone: Joi.string().trim().max(30).allow('', null),
    department: Joi.string().trim().max(100).allow('', null),
    position: Joi.string().trim().max(100).allow('', null),
    street: Joi.string().trim().max(200).allow('', null),
    city: Joi.string().trim().max(100).allow('', null),
    zip: Joi.string().trim().max(20).allow('', null),
    country: Joi.string().trim().max(100).allow('', null),
  }),
};

export const listUsersSchema = {
  query: cursorPagination.keys({
    role: objectId,
    status: Joi.string().valid('active', 'pending_activation', 'deactivated', 'locked'),
    language: Joi.string().valid('de', 'en', 'fr', 'it'),
    search: Joi.string().trim().max(100),
  }),
};

export const directoryUsersSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(80),
    search: Joi.string().trim().max(100).allow(''),
  }),
};

export const userIdParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const listUserProjectsSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  query: cursorPagination.keys({
    assignmentType: Joi.string().valid('all', ...assignmentTypes).default('all'),
    search: Joi.string().trim().max(100),
  }),
};

export const assignUserProjectSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    projectId: objectId.required(),
    assignmentType: Joi.string().valid(...assignmentTypes).default('manager'),
  }),
};

export const bulkUpdateSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
    data: Joi.object({
      roleId: objectId,
      language: Joi.string().valid('de', 'en', 'fr', 'it'),
      status: Joi.string().valid('active', 'deactivated', 'locked'),
    }).min(1).required(),
  }),
};

export const bulkDeleteSchema = {
  body: Joi.object({
    ids: Joi.array().items(objectId).min(1).max(100).required(),
  }),
};

export { idParam };
