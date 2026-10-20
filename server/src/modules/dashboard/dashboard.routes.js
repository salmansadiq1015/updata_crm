import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import dashboardService, { normalizeAnalyticsFilters } from './dashboard.service.js';

const router = Router();

router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const data = await cacheManager.getOrSet(
      'app:dashboard:stats',
      () => dashboardService.getLegacyStats(),
      { l1Ttl: 30, l2Ttl: 60 },
    );

    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/mobile-crm', authenticate, requirePermission('lead:read'), async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const data = await cacheManager.getOrSet(
      `app:dashboard:mobile-crm:${userId}`,
      () => dashboardService.getMobileCrmStats(userId),
      { l1Ttl: 30, l2Ttl: 60 },
    );
    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', authenticate, async (req, res, next) => {
  try {
    const filters = normalizeAnalyticsFilters(req.query);
    const cacheKey = [
      'app:dashboard:analytics',
      filters.range,
      filters.granularity,
      filters.startDate.toISOString().slice(0, 10),
      filters.endDate.toISOString().slice(0, 10),
    ].join(':');

    const data = await cacheManager.getOrSet(
      cacheKey,
      () => dashboardService.getAnalyticsSnapshot(filters),
      { l1Ttl: 45, l2Ttl: 120 },
    );

    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
