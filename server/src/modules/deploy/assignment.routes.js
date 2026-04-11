import { Router } from 'express';
import assignmentController from './assignment.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createAssignmentSchema, updateAssignmentSchema, assignmentIdParamSchema,
  moveAssignmentSchema, resizeAssignmentSchema,
} from './assignment.validation.js';

const router = Router();

// Standard CRUD
router.post('/', authenticate, requirePermission('scheduling:write'), validate(createAssignmentSchema), (req, res, next) => assignmentController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('scheduling:read'), validate(assignmentIdParamSchema), (req, res, next) => assignmentController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('scheduling:write'), validate(updateAssignmentSchema), (req, res, next) => assignmentController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('scheduling:write'), validate(assignmentIdParamSchema), (req, res, next) => assignmentController.delete(req, res, next));

// Actions
router.post('/:id/move', authenticate, requirePermission('scheduling:write'), validate(moveAssignmentSchema), (req, res, next) => assignmentController.move(req, res, next));
router.post('/:id/resize', authenticate, requirePermission('scheduling:write'), validate(resizeAssignmentSchema), (req, res, next) => assignmentController.resize(req, res, next));

export default router;
