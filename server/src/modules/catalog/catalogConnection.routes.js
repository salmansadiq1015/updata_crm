import { Router } from 'express';
import catalogConnectionController from './catalogConnection.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createConnectionSchema,
  updateConnectionSchema,
  listConnectionsSchema,
  connectionIdParamSchema,
  triggerConnectionSyncSchema,
} from './catalogConnection.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('catalog:admin'), validate(listConnectionsSchema), (req, res, next) => catalogConnectionController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:admin'), validate(createConnectionSchema), (req, res, next) => catalogConnectionController.create(req, res, next));
router.post('/:id/sync', authenticate, requirePermission('catalog:admin'), validate(triggerConnectionSyncSchema), (req, res, next) => catalogConnectionController.triggerSync(req, res, next));
router.get('/:id/logs', authenticate, requirePermission('catalog:admin'), validate(connectionIdParamSchema), (req, res, next) => catalogConnectionController.getLogs(req, res, next));
router.get('/:id', authenticate, requirePermission('catalog:admin'), validate(connectionIdParamSchema), (req, res, next) => catalogConnectionController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('catalog:admin'), validate(updateConnectionSchema), (req, res, next) => catalogConnectionController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('catalog:admin'), validate(connectionIdParamSchema), (req, res, next) => catalogConnectionController.delete(req, res, next));

export default router;
