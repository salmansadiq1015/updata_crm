import { Router } from 'express';
import budgetController from './budget.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  budgetIdSchema,
  budgetSummarySchema,
  createBudgetSchema,
  listBudgetsSchema,
  updateBudgetSchema,
} from './budget.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:read'), validate(listBudgetsSchema), (req, res, next) => budgetController.list(req, res, next));
router.get('/summary', authenticate, requirePermission('accounting:read'), validate(budgetSummarySchema), (req, res, next) => budgetController.summary(req, res, next));
router.post('/', authenticate, requirePermission('accounting:admin'), validate(createBudgetSchema), (req, res, next) => budgetController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:read'), validate(budgetIdSchema), (req, res, next) => budgetController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:admin'), validate(updateBudgetSchema), (req, res, next) => budgetController.update(req, res, next));
router.post('/:id/approve', authenticate, requirePermission('accounting:admin'), validate(budgetIdSchema), (req, res, next) => budgetController.approve(req, res, next));
router.post('/:id/lock', authenticate, requirePermission('accounting:admin'), validate(budgetIdSchema), (req, res, next) => budgetController.lock(req, res, next));
router.get('/:id/variance', authenticate, requirePermission('accounting:read'), validate(budgetIdSchema), (req, res, next) => budgetController.variance(req, res, next));

export default router;
