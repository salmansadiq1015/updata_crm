import { Router } from 'express';
import notificationController from './notification.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  registerDeviceSchema,
  removeDeviceSchema,
  listNotificationsSchema,
  markNotificationReadSchema,
  getPreferencesSchema,
  updatePreferencesSchema,
} from './notification.validation.js';

// Device routes (mounted under /devices)
const deviceRouter = Router();

deviceRouter.post(
  '/register',
  authenticate,
  requirePermission('mobile:write'),
  validate(registerDeviceSchema),
  (req, res, next) => notificationController.registerDevice(req, res, next),
);

deviceRouter.delete(
  '/:deviceId',
  authenticate,
  requirePermission('mobile:write'),
  validate(removeDeviceSchema),
  (req, res, next) => notificationController.removeDevice(req, res, next),
);

// Notification routes (mounted under /notifications)
const notificationRouter = Router();

notificationRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listNotificationsSchema),
  (req, res, next) => notificationController.listNotifications(req, res, next),
);

notificationRouter.put(
  '/:id/read',
  authenticate,
  requirePermission('mobile:write'),
  validate(markNotificationReadSchema),
  (req, res, next) => notificationController.markRead(req, res, next),
);

notificationRouter.get(
  '/preferences',
  authenticate,
  requirePermission('mobile:read'),
  validate(getPreferencesSchema),
  (req, res, next) => notificationController.getPreferences(req, res, next),
);

notificationRouter.put(
  '/preferences',
  authenticate,
  requirePermission('mobile:write'),
  validate(updatePreferencesSchema),
  (req, res, next) => notificationController.updatePreferences(req, res, next),
);

export { deviceRouter, notificationRouter };
