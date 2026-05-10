import { Router } from 'express';
import systemController from './system.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';

/**
 * System admin routes.
 * All routes require settings administration permission.
 */
const router = Router();

router.use(authenticate, requirePermission('settings:admin'));

// Config
router.get('/config', (req, res, next) => systemController.getConfig(req, res, next));

// Jobs
router.get('/jobs', (req, res, next) => systemController.getJobs(req, res, next));
router.get('/jobs/:queueName/:jobId', (req, res, next) => systemController.getJob(req, res, next));
router.delete('/jobs/:queueName/:jobId', (req, res, next) => systemController.removeJob(req, res, next));

// Dead Letter Queue (failed jobs)
router.get('/events/dlq', (req, res, next) => systemController.getFailedJobs(req, res, next));
router.post('/events/dlq/:queueName/:jobId/retry', (req, res, next) => systemController.retryFailedJob(req, res, next));

// Cache
router.post('/cache/invalidate', (req, res, next) => systemController.invalidateCache(req, res, next));
router.get('/cache/stats', (req, res, next) => systemController.getCacheStats(req, res, next));

export default router;
