import { Router } from 'express';
import exchangeRateController from './exchangeRate.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  convertExchangeRateSchema,
  fxRevaluationPostSchema,
  fxRevaluationPreviewSchema,
  fxRevaluationRunsSchema,
  listExchangeRatesSchema,
  resolveExchangeRateSchema,
  upsertExchangeRateSchema,
} from './exchangeRate.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:read'), validate(listExchangeRatesSchema), (req, res, next) => exchangeRateController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:admin'), validate(upsertExchangeRateSchema), (req, res, next) => exchangeRateController.upsert(req, res, next));
router.get('/resolve', authenticate, requirePermission('accounting:read'), validate(resolveExchangeRateSchema), (req, res, next) => exchangeRateController.resolve(req, res, next));
router.post('/convert', authenticate, requirePermission('accounting:read'), validate(convertExchangeRateSchema), (req, res, next) => exchangeRateController.convert(req, res, next));
router.get('/revaluation/preview', authenticate, requirePermission('accounting:read'), validate(fxRevaluationPreviewSchema), (req, res, next) => exchangeRateController.previewRevaluation(req, res, next));
router.post('/revaluation/post', authenticate, requirePermission('accounting:admin'), validate(fxRevaluationPostSchema), (req, res, next) => exchangeRateController.postRevaluation(req, res, next));
router.get('/revaluation/runs', authenticate, requirePermission('accounting:read'), validate(fxRevaluationRunsSchema), (req, res, next) => exchangeRateController.listRevaluationRuns(req, res, next));

export default router;
