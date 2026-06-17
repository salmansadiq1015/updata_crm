import { Router } from 'express';
import catalogMarkupRuleController from './catalogMarkupRule.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createMarkupRuleSchema,
  updateMarkupRuleSchema,
  listMarkupRulesSchema,
  markupRuleIdParamSchema,
  resolveMarkupRuleSchema,
} from './catalogMarkupRule.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('catalog:pricing'), validate(listMarkupRulesSchema), (req, res, next) => catalogMarkupRuleController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:pricing'), validate(createMarkupRuleSchema), (req, res, next) => catalogMarkupRuleController.create(req, res, next));
router.post('/resolve', authenticate, requirePermission('catalog:read'), validate(resolveMarkupRuleSchema), (req, res, next) => catalogMarkupRuleController.resolve(req, res, next));
router.get('/:id', authenticate, requirePermission('catalog:pricing'), validate(markupRuleIdParamSchema), (req, res, next) => catalogMarkupRuleController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('catalog:pricing'), validate(updateMarkupRuleSchema), (req, res, next) => catalogMarkupRuleController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('catalog:pricing'), validate(markupRuleIdParamSchema), (req, res, next) => catalogMarkupRuleController.delete(req, res, next));

export default router;
