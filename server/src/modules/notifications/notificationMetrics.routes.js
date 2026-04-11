import { Router } from 'express';
import notificationMetricsController from './notificationMetrics.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { metricsQuerySchema } from './notificationMetrics.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:metrics:read'), validate(metricsQuerySchema), (req, res, next) => notificationMetricsController.getMetrics(req, res, next));

export default router;
