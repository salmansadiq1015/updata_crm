import { Router } from 'express';
import calendarSyncController from './calendarSync.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  connectSchema,
  callbackSchema,
  disconnectSchema,
} from './calendarSync.validation.js';

const router = Router();

router.post('/connect', authenticate, requirePermission('integrations:calendar'), validate(connectSchema), (req, res, next) => calendarSyncController.connect(req, res, next));
router.get('/callback', authenticate, requirePermission('integrations:calendar'), validate(callbackSchema), (req, res, next) => calendarSyncController.callback(req, res, next));
router.get('/status', authenticate, requirePermission('integrations:calendar'), (req, res, next) => calendarSyncController.getStatus(req, res, next));
router.post('/disconnect', authenticate, requirePermission('integrations:calendar'), validate(disconnectSchema), (req, res, next) => calendarSyncController.disconnect(req, res, next));

export default router;
