import { Router } from 'express';
import catalogCategoryController from './catalogCategory.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listCategoriesSchema,
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
  moveCategorySchema,
} from './catalogCategory.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('catalog:read'), validate(listCategoriesSchema), (req, res, next) => catalogCategoryController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:write'), validate(createCategorySchema), (req, res, next) => catalogCategoryController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('catalog:read'), validate(categoryIdParamSchema), (req, res, next) => catalogCategoryController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('catalog:write'), validate(updateCategorySchema), (req, res, next) => catalogCategoryController.update(req, res, next));
router.patch('/:id/move', authenticate, requirePermission('catalog:admin'), validate(moveCategorySchema), (req, res, next) => catalogCategoryController.move(req, res, next));
router.patch('/:id/deactivate', authenticate, requirePermission('catalog:admin'), validate(categoryIdParamSchema), (req, res, next) => catalogCategoryController.deactivate(req, res, next));

export default router;
