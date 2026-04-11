import { Router } from 'express';
import integrationAdminController from './integrationAdmin.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  integrationKeyParamSchema,
  updateConfigSchema,
  healthHistorySchema,
  syncHistorySchema,
  syncIdParamSchema,
} from './integrationAdmin.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('integrations:admin'), (req, res, next) => integrationAdminController.listAll(req, res, next));
router.get('/dashboard', authenticate, requirePermission('integrations:admin'), (req, res, next) => integrationAdminController.getDashboard(req, res, next));
router.get('/:key', authenticate, requirePermission('integrations:admin'), validate(integrationKeyParamSchema), (req, res, next) => integrationAdminController.getByKey(req, res, next));
router.put('/:key/config', authenticate, requirePermission('integrations:admin'), validate(updateConfigSchema), (req, res, next) => integrationAdminController.updateConfig(req, res, next));
router.post('/:key/enable', authenticate, requirePermission('integrations:admin'), validate(integrationKeyParamSchema), (req, res, next) => integrationAdminController.enable(req, res, next));
router.post('/:key/disable', authenticate, requirePermission('integrations:admin'), validate(integrationKeyParamSchema), (req, res, next) => integrationAdminController.disable(req, res, next));
router.post('/:key/health-check', authenticate, requirePermission('integrations:admin'), validate(integrationKeyParamSchema), (req, res, next) => integrationAdminController.runHealthCheck(req, res, next));
router.get('/:key/health-history', authenticate, requirePermission('integrations:admin'), validate(healthHistorySchema), (req, res, next) => integrationAdminController.getHealthHistory(req, res, next));
router.get('/:key/sync', authenticate, requirePermission('integrations:admin'), validate(syncHistorySchema), (req, res, next) => integrationAdminController.getSyncHistory(req, res, next));
router.get('/:key/sync/:syncId', authenticate, requirePermission('integrations:admin'), validate(syncIdParamSchema), (req, res, next) => integrationAdminController.getSyncById(req, res, next));

export default router;
