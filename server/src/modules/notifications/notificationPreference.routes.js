import { Router } from 'express';
import notificationPreferenceController from './notificationPreference.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { updatePreferencesSchema } from './notificationPreference.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:preferences'), (req, res, next) => notificationPreferenceController.getPreferences(req, res, next));
router.put('/', authenticate, requirePermission('notifications:preferences'), validate(updatePreferencesSchema), (req, res, next) => notificationPreferenceController.updatePreferences(req, res, next));

export default router;
