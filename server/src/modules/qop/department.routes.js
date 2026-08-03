import { Router } from 'express';
import Joi from 'joi';
import departmentController from './department.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';

const createSchema = {
  body: Joi.object({
    name: Joi.string().required().trim().max(100),
    code: Joi.string().required().trim().uppercase().max(20).alphanum(),
    color: Joi.string().trim().max(20).allow(null, ''),
    icon: Joi.string().trim().max(40).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
    scopeQop: Joi.boolean(),
    scopeTasks: Joi.boolean(),
  }),
};

const updateSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    name: Joi.string().trim().max(100),
    isActive: Joi.boolean(),
    color: Joi.string().trim().max(20).allow(null, ''),
    icon: Joi.string().trim().max(40).allow(null, ''),
    sortOrder: Joi.number().integer().min(0),
    scopeQop: Joi.boolean(),
    scopeTasks: Joi.boolean(),
  }).min(1),
};

const router = Router();

router.get('/', authenticate, requirePermission('quotations:read'), (req, res, next) => departmentController.list(req, res, next));
router.post('/', authenticate, requirePermission('quotations:admin'), validate(createSchema), (req, res, next) => departmentController.create(req, res, next));
router.patch('/:id', authenticate, requirePermission('quotations:admin'), validate(updateSchema), (req, res, next) => departmentController.update(req, res, next));

export default router;
