import { Router } from 'express';
import Joi from 'joi';
import officeWorkCategoryController from './officeWorkCategory.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';

const bodySchema = {
  body: Joi.object({
    name: Joi.string().trim().max(100).required(),
    color: Joi.string().trim().max(20).allow('', null),
    sortOrder: Joi.number().integer(),
    isActive: Joi.boolean(),
  }),
};
const updateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(100),
    color: Joi.string().trim().max(20).allow('', null),
    sortOrder: Joi.number().integer(),
    isActive: Joi.boolean(),
  }).min(1),
};
const idSchema = { params: Joi.object({ id: objectId.required() }) };

const router = Router();

// Readable by anyone booking time; managed by time-tracking admins.
router.get('/', authenticate, requirePermission('time-tracking:read'), (req, res, next) => officeWorkCategoryController.list(req, res, next));
router.post('/', authenticate, requirePermission('time-tracking:admin'), validate(bodySchema), (req, res, next) => officeWorkCategoryController.create(req, res, next));
router.put('/:id', authenticate, requirePermission('time-tracking:admin'), validate(updateSchema), (req, res, next) => officeWorkCategoryController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('time-tracking:admin'), validate(idSchema), (req, res, next) => officeWorkCategoryController.remove(req, res, next));

export default router;
