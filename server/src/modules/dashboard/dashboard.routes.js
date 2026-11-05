import { Router } from 'express';
import { authenticate, requirePermission, loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import dashboardService, { normalizeAnalyticsFilters } from './dashboard.service.js';

import { getDashboardIntelligence } from './dashboard-intelligence.service.js';

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

// This summary stays separate from the system-wide business cache: source workspaces
// are owner-scoped and permission changes must never share a cached result.
router.get('/intelligence', authenticate, async (req, res, next) => {
  try {
    const permissions = await loadUserPermissions(req.user);
    const admin = req.user.role?.name === 'Admin';
    const can = permission => admin || satisfiesPermission(permissions, permission);
    const access = { assistant: can('ai:sessions'), calling: can('ai-calling:read'), incoming: can('inbound-calls:read'), leads: can('lead:read') };
    const viewer = { id: req.user._id, access, inboundAll: can('inbound-calls:admin') };
    const filters = normalizeAnalyticsFilters(req.query);
    const key = `app:dashboard:intelligence:${viewer.id}:${Object.values(access).map(Number).join('')}:${Number(viewer.inboundAll)}:${filters.range}:${filters.granularity}:${filters.endDate.toISOString().slice(0, 10)}`;
    const data = await cacheManager.getOrSet(key, () => getDashboardIntelligence(filters, viewer), { l1Ttl: 30, l2Ttl: 45 });
    return res.success({ data });
  } catch (error) { next(error); }
});

export default router;
