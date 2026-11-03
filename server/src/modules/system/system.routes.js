import SidebarSettings from './sidebarSettings.model.js';
import { Router } from 'express';
import systemController from './system.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';

/**
 * System admin routes.
 * Sidebar visibility is readable by signed-in users; writes and operational
 * routes require settings administration permission.
 */
const router = Router();

router.use(authenticate);

// Every signed-in user needs the company navigation configuration.
router.get('/sidebar', async (req, res, next) => {
  try {
    const settings = await SidebarSettings.findById('sidebar').lean();
    return res.success({ data: { hiddenMenus: settings?.hiddenMenus || [] } });
  } catch (error) { next(error); }
});

router.put('/sidebar', requirePermission('settings:admin'), async (req, res, next) => {
  try {
    const hiddenMenus = req.body?.hiddenMenus;
    if (!Array.isArray(hiddenMenus) || hiddenMenus.length > 300 || hiddenMenus.some(
      (id) => typeof id !== 'string' || !id.trim() || id.length > 160,
    )) {
      return res.fail({ statusCode: 400, code: 'INVALID_SIDEBAR_CONFIG', message: 'hiddenMenus must be an array of menu identifiers' });
    }
    // Keep the Settings entry available so administrators can restore menus.
    const settings = await SidebarSettings.findByIdAndUpdate('sidebar', {
      $set: {
        hiddenMenus: [...new Set(hiddenMenus)].filter((id) => !['/admin/settings', '/settings'].includes(id)),
        updatedBy: req.user._id,
      },
    }, { upsert: true, returnDocument: 'after', runValidators: true }).lean();
    return res.success({ data: { hiddenMenus: settings.hiddenMenus } });
  } catch (error) { next(error); }
});

router.use(requirePermission('settings:admin'));

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
