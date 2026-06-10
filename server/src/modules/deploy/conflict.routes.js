import { Router } from 'express';
import conflictController from './conflict.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  checkConflictSchema,
  resolveConflictSchema,
} from './conflict.validation.js';

const router = Router();

router.post('/check', authenticate, requirePermission('scheduling:read'), validate(checkConflictSchema), (req, res, next) => conflictController.check(req, res, next));
router.get('/', authenticate, requirePermission('scheduling:read'), (req, res, next) => conflictController.listActive(req, res, next));
router.patch('/:id/resolve', authenticate, requirePermission('scheduling:write'), validate(resolveConflictSchema), (req, res, next) => conflictController.resolve(req, res, next));

export default router;
