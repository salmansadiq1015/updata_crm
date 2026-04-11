import { Router } from 'express';
import aiAnalyticsController from './aiAnalytics.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  accuracySchema,
  usageStatsSchema,
  topCorrectionsSchema,
} from './aiAnalytics.validation.js';

const router = Router();

router.get('/accuracy', authenticate, requirePermission('ai:analytics:read'), validate(accuracySchema), (req, res, next) => aiAnalyticsController.getAccuracy(req, res, next));
router.get('/usage', authenticate, requirePermission('ai:analytics:read'), validate(usageStatsSchema), (req, res, next) => aiAnalyticsController.getUsageStats(req, res, next));
router.get('/corrections/top', authenticate, requirePermission('ai:analytics:read'), validate(topCorrectionsSchema), (req, res, next) => aiAnalyticsController.getTopCorrections(req, res, next));

export default router;
