import { Router } from 'express';
import widgetAdminController from './widgetAdmin.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listSubmissionsSchema,
  submissionIdParamSchema,
  markProcessedSchema,
  updateWidgetConfigSchema,
} from './widgetAdmin.validation.js';

const router = Router();

router.get('/submissions', authenticate, requirePermission('integrations:widget:manage'), validate(listSubmissionsSchema), (req, res, next) => widgetAdminController.listSubmissions(req, res, next));
router.get('/submissions/:id', authenticate, requirePermission('integrations:widget:manage'), validate(submissionIdParamSchema), (req, res, next) => widgetAdminController.getSubmission(req, res, next));
router.post('/submissions/:id/process', authenticate, requirePermission('integrations:widget:manage'), validate(markProcessedSchema), (req, res, next) => widgetAdminController.markProcessed(req, res, next));
router.get('/config', authenticate, requirePermission('integrations:widget:manage'), (req, res, next) => widgetAdminController.getConfig(req, res, next));
router.put('/config', authenticate, requirePermission('integrations:widget:manage'), validate(updateWidgetConfigSchema), (req, res, next) => widgetAdminController.updateConfig(req, res, next));

export default router;
