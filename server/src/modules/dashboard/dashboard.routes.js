import { Router } from 'express';
import { authenticate, requirePermission, loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import dashboardService, { normalizeAnalyticsFilters, businessDateKey } from './dashboard.service.js';
import { getDashboardIntelligence } from './dashboard-intelligence.service.js';
import { cachedDashboardRead, DASHBOARD_CACHE_TTL } from './dashboard.cache.js';
import { analyticsQuerySchema } from './dashboard.validation.js';

const router = Router();

// Cache keys carry the business date (Europe/Zurich) so "today" metrics roll over
// at midnight, and a schema version so a deploy never serves an older payload
// from Redis. Invalidation is TTL-based — see dashboard.cache.js for why.
const KEY_VERSION = 'v2';

router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const data = await cachedDashboardRead(
      `app:dashboard:stats:${KEY_VERSION}:${businessDateKey()}`,
      () => dashboardService.getLegacyStats(),
      DASHBOARD_CACHE_TTL.stats,
    );

    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/mobile-crm', authenticate, requirePermission('lead:read'), async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const data = await cachedDashboardRead(
      `app:dashboard:mobile-crm:${KEY_VERSION}:${userId}:${businessDateKey()}`,
      () => dashboardService.getMobileCrmStats(userId),
      DASHBOARD_CACHE_TTL.stats,
    );
    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', authenticate, validate({ query: analyticsQuerySchema }), async (req, res, next) => {
  try {
    const filters = normalizeAnalyticsFilters(req._validatedQuery);
    const cacheKey = [
      'app:dashboard:analytics',
      KEY_VERSION,
      filters.range,
      filters.granularity,
      businessDateKey(filters.now),
    ].join(':');

    const data = await cachedDashboardRead(
      cacheKey,
      () => dashboardService.getAnalyticsSnapshot(filters),
      DASHBOARD_CACHE_TTL.analytics,
    );

    return res.success({ data });
  } catch (err) {
    next(err);
  }
});

// This summary stays separate from the system-wide business cache: source workspaces
// are owner-scoped and permission changes must never share a cached result.
router.get('/intelligence', authenticate, validate({ query: analyticsQuerySchema }), async (req, res, next) => {
  try {
    const permissions = await loadUserPermissions(req.user);
    const admin = req.user.role?.name === 'Admin';
    const can = permission => admin || satisfiesPermission(permissions, permission);
    const access = { assistant: can('ai:sessions'), calling: can('ai-calling:read'), incoming: can('inbound-calls:read'), leads: can('lead:read') };
    const viewer = { id: req.user._id, access, inboundAll: can('inbound-calls:admin') };
    const filters = normalizeAnalyticsFilters(req._validatedQuery);
    const key = [
      'app:dashboard:intelligence',
      KEY_VERSION,
      String(viewer.id),
      Object.values(access).map(Number).join(''),
      Number(viewer.inboundAll),
      filters.range,
      filters.granularity,
      businessDateKey(filters.now),
    ].join(':');
    const data = await cachedDashboardRead(key, () => getDashboardIntelligence(filters, viewer), DASHBOARD_CACHE_TTL.intelligence);
    return res.success({ data });
  } catch (error) { next(error); }
});

export default router;
