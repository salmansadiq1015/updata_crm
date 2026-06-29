import { Router } from 'express';
import recurringTransactionController from './recurringTransaction.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createRecurringTransactionSchema,
  listRecurringTransactionsSchema,
  recurringIdSchema,
  recurringRunsSchema,
  runDueRecurringSchema,
  runOneRecurringSchema,
  updateRecurringTransactionSchema,
} from './recurringTransaction.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:read'), validate(listRecurringTransactionsSchema), (req, res, next) => recurringTransactionController.list(req, res, next));
router.get('/summary', authenticate, requirePermission('accounting:read'), (req, res, next) => recurringTransactionController.summary(req, res, next));
router.get('/runs', authenticate, requirePermission('accounting:read'), validate(recurringRunsSchema), (req, res, next) => recurringTransactionController.runs(req, res, next));
router.post('/run-due', authenticate, requirePermission('accounting:admin'), validate(runDueRecurringSchema), (req, res, next) => recurringTransactionController.runDue(req, res, next));
router.post('/', authenticate, requirePermission('accounting:admin'), validate(createRecurringTransactionSchema), (req, res, next) => recurringTransactionController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:read'), validate(recurringIdSchema), (req, res, next) => recurringTransactionController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:admin'), validate(updateRecurringTransactionSchema), (req, res, next) => recurringTransactionController.update(req, res, next));
router.post('/:id/activate', authenticate, requirePermission('accounting:admin'), validate(recurringIdSchema), (req, res, next) => recurringTransactionController.activate(req, res, next));
router.post('/:id/pause', authenticate, requirePermission('accounting:admin'), validate(recurringIdSchema), (req, res, next) => recurringTransactionController.pause(req, res, next));
router.post('/:id/archive', authenticate, requirePermission('accounting:admin'), validate(recurringIdSchema), (req, res, next) => recurringTransactionController.archive(req, res, next));
router.post('/:id/run', authenticate, requirePermission('accounting:admin'), validate(runOneRecurringSchema), (req, res, next) => recurringTransactionController.runOne(req, res, next));

export default router;
