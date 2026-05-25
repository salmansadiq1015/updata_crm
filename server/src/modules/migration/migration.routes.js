import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import validate from '../../shared/validation/validate.js';
import migrationController from './migration.controller.js';
import {
  addSourceRecordsSchema,
  createRunSchema,
  exportErrorsSchema,
  listErrorsSchema,
  listRunsSchema,
  rollbackSchema,
  runIdParamSchema,
  spotCheckSchema,
} from './migration.validation.js';

const router = Router();

router.use(authenticate, requirePermission('settings:admin'));

router.get('/runs', validate(listRunsSchema), (req, res, next) => migrationController.listRuns(req, res, next));
router.post('/runs', validate(createRunSchema), (req, res, next) => migrationController.createRun(req, res, next));
router.get('/runs/:runId', validate(runIdParamSchema), (req, res, next) => migrationController.getRun(req, res, next));
router.post('/runs/:runId/source-records', validate(addSourceRecordsSchema), (req, res, next) => migrationController.addSourceRecords(req, res, next));
router.post('/runs/:runId/start', validate(runIdParamSchema), (req, res, next) => migrationController.start(req, res, next));
router.post('/runs/:runId/pause', validate(runIdParamSchema), (req, res, next) => migrationController.pause(req, res, next));
router.post('/runs/:runId/resume', validate(runIdParamSchema), (req, res, next) => migrationController.resume(req, res, next));
router.post('/runs/:runId/cancel', validate(runIdParamSchema), (req, res, next) => migrationController.cancel(req, res, next));
router.post('/runs/:runId/rollback', validate(rollbackSchema), (req, res, next) => migrationController.rollback(req, res, next));
router.get('/runs/:runId/progress', validate(runIdParamSchema), (req, res, next) => migrationController.progress(req, res, next));
router.get('/runs/:runId/errors', validate(listErrorsSchema), (req, res, next) => migrationController.errors(req, res, next));
router.get('/runs/:runId/errors/export', validate(exportErrorsSchema), (req, res, next) => migrationController.exportErrors(req, res, next));
router.get('/runs/:runId/validation-report', validate(runIdParamSchema), (req, res, next) => migrationController.validationReport(req, res, next));
router.post('/runs/:runId/spot-check/generate', validate(spotCheckSchema), (req, res, next) => migrationController.generateSpotCheck(req, res, next));

export default router;
