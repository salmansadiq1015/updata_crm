import { Router } from 'express';
import timeEntryController from './timeEntry.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTimeEntrySchema,
  updateTimeEntrySchema,
  deleteTimeEntrySchema,
  listTimeEntriesSchema,
  releaseTimeEntrySchema,
} from './timeEntry.validation.js';

// Nested router for routes under /orders/:id
const timeEntryOrderRouter = Router({ mergeParams: true });

timeEntryOrderRouter.post(
  '/time-entries',
  authenticate,
  requirePermission('mobile:write'),
  validate(createTimeEntrySchema),
  (req, res, next) => timeEntryController.create(req, res, next),
);

// Standalone router for routes under /time-entries/:entryId
const timeEntryRouter = Router();

timeEntryRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listTimeEntriesSchema),
  (req, res, next) => timeEntryController.listByDateRange(req, res, next),
);

timeEntryRouter.put(
  '/:entryId',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateTimeEntrySchema),
  (req, res, next) => timeEntryController.update(req, res, next),
);

timeEntryRouter.delete(
  '/:entryId',
  authenticate,
  requirePermission('mobile:write'),
  validate(deleteTimeEntrySchema),
  (req, res, next) => timeEntryController.delete(req, res, next),
);

timeEntryRouter.post(
  '/:entryId/release',
  authenticate,
  requirePermission('mobile:write'),
  validate(releaseTimeEntrySchema),
  (req, res, next) => timeEntryController.release(req, res, next),
);

export { timeEntryOrderRouter, timeEntryRouter };
