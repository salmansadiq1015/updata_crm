import { Router } from 'express';
import mobileController from './mobile.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  mobileAssignmentsSchema,
  mobileAssignmentIdSchema,
  mobileSyncSchema,
} from './mobile.validation.js';

const router = Router();

router.get(
  '/assignments',
  authenticate,
  requirePermission('scheduling:read'),
  validate(mobileAssignmentsSchema),
  (req, res, next) => mobileController.getMyAssignments(req, res, next),
);

// sync BEFORE /:id to avoid route conflict
router.get(
  '/assignments/sync',
  authenticate,
  requirePermission('scheduling:read'),
  validate(mobileSyncSchema),
  (req, res, next) => mobileController.syncAssignments(req, res, next),
);

router.get(
  '/assignments/:id',
  authenticate,
  requirePermission('scheduling:read'),
  validate(mobileAssignmentIdSchema),
  (req, res, next) => mobileController.getAssignmentDetail(req, res, next),
);

export default router;
