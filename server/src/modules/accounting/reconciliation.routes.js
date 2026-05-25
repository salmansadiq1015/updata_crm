import { Router } from 'express';
import reconciliationController from './reconciliation.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  runReconciliationSchema, unmatchedSchema, suggestionsSchema,
  matchSchema, matchApSchema, categorizeSchema,
} from './reconciliation.validation.js';

const router = Router();

router.post('/run', authenticate, requirePermission('accounting:reconciliation:manage'), validate(runReconciliationSchema), (req, res, next) => reconciliationController.run(req, res, next));
router.get('/unmatched', authenticate, requirePermission('accounting:reconciliation:manage'), validate(unmatchedSchema), (req, res, next) => reconciliationController.getUnmatched(req, res, next));
router.get('/suggestions/:txId', authenticate, requirePermission('accounting:reconciliation:manage'), validate(suggestionsSchema), (req, res, next) => reconciliationController.getSuggestions(req, res, next));
router.post('/match', authenticate, requirePermission('accounting:reconciliation:manage'), validate(matchSchema), (req, res, next) => reconciliationController.match(req, res, next));
router.post('/match-ap', authenticate, requirePermission('accounting:reconciliation:manage'), validate(matchApSchema), (req, res, next) => reconciliationController.matchAp(req, res, next));
router.post('/categorize', authenticate, requirePermission('accounting:reconciliation:manage'), validate(categorizeSchema), (req, res, next) => reconciliationController.categorize(req, res, next));

export default router;
