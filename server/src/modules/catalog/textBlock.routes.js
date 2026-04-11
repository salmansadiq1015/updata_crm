import { Router } from 'express';
import textBlockController from './textBlock.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTextBlockSchema,
  updateTextBlockSchema,
  listTextBlocksSchema,
  textBlockIdParamSchema,
} from './textBlock.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('catalog:read'), validate(listTextBlocksSchema), (req, res, next) => textBlockController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:write'), validate(createTextBlockSchema), (req, res, next) => textBlockController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('catalog:read'), validate(textBlockIdParamSchema), (req, res, next) => textBlockController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('catalog:write'), validate(updateTextBlockSchema), (req, res, next) => textBlockController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('catalog:delete'), validate(textBlockIdParamSchema), (req, res, next) => textBlockController.delete(req, res, next));

export default router;
