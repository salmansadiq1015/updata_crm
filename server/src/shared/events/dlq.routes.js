import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import dlqService from './dlq.service.js';

/**
 * Admin routes for EventBus Dead-Letter Queue management.
 * All routes require authentication + admin:system permission.
 */
const router = Router();

// List pending / failed DLQ entries
router.get(
  '/',
  authenticate,
  requirePermission('admin:system'),
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const entries = await dlqService.listPending(limit);
      res.success({ data: entries });
    } catch (err) {
      next(err);
    }
  },
);

// Retry a specific DLQ entry
router.post(
  '/:id/retry',
  authenticate,
  requirePermission('admin:system'),
  async (req, res, next) => {
    try {
      const entry = await dlqService.retry(req.params.id);
      res.success({ data: entry });
    } catch (err) {
      next(err);
    }
  },
);

// Resolve (dismiss) a specific DLQ entry
router.post(
  '/:id/resolve',
  authenticate,
  requirePermission('admin:system'),
  async (req, res, next) => {
    try {
      const entry = await dlqService.resolve(req.params.id);
      res.success({ data: entry });
    } catch (err) {
      next(err);
    }
  },
);

// Purge resolved entries older than N days
router.delete(
  '/purge',
  authenticate,
  requirePermission('admin:system'),
  async (req, res, next) => {
    try {
      const olderThanDays = parseInt(req.query.olderThanDays, 10) || 30;
      const deletedCount = await dlqService.purgeResolved(olderThanDays);
      res.success({ data: { deletedCount } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
