import { Router } from 'express';
import syncController from './sync.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { fullSyncSchema, syncStatusSchema } from './sync.validation.js';

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  validate(fullSyncSchema),
  (req, res, next) => syncController.fullSync(req, res, next),
);

router.get(
  '/status',
  authenticate,
  requirePermission('mobile:read'),
  validate(syncStatusSchema),
  (req, res, next) => syncController.getSyncStatus(req, res, next),
);

export default router;
