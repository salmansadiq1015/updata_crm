import { Router } from 'express';
import taskController from './task.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTaskSchema, updateTaskSchema, taskIdParamSchema,
  listTasksSchema, changeStatusSchema, completeTaskSchema,
  moveTaskSchema, bulkOperationSchema, createSubtaskSchema,
  parentIdParamSchema, reorderSubtasksSchema, promoteTaskSchema,
} from './task.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('tasks:manage'), validate(listTasksSchema), (req, res, next) => taskController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:manage'), validate(createTaskSchema), (req, res, next) => taskController.create(req, res, next));
router.post('/bulk', authenticate, requirePermission('tasks:manage'), validate(bulkOperationSchema), (req, res, next) => taskController.bulkOperation(req, res, next));
router.get('/:id', authenticate, requirePermission('tasks:manage'), validate(taskIdParamSchema), (req, res, next) => taskController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('tasks:manage'), validate(updateTaskSchema), (req, res, next) => taskController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('tasks:manage'), validate(taskIdParamSchema), (req, res, next) => taskController.remove(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('tasks:manage'), validate(changeStatusSchema), (req, res, next) => taskController.changeStatus(req, res, next));
router.patch('/:id/complete', authenticate, requirePermission('tasks:manage'), validate(completeTaskSchema), (req, res, next) => taskController.complete(req, res, next));
router.patch('/:id/reopen', authenticate, requirePermission('tasks:manage'), validate(taskIdParamSchema), (req, res, next) => taskController.reopen(req, res, next));
router.patch('/:id/move', authenticate, requirePermission('tasks:manage'), validate(moveTaskSchema), (req, res, next) => taskController.moveToList(req, res, next));
router.patch('/:id/promote', authenticate, requirePermission('tasks:manage'), validate(promoteTaskSchema), (req, res, next) => taskController.promote(req, res, next));
router.get('/:parentId/subtasks', authenticate, requirePermission('tasks:manage'), validate(parentIdParamSchema), (req, res, next) => taskController.getSubtasks(req, res, next));
router.post('/:parentId/subtasks', authenticate, requirePermission('tasks:manage'), validate(createSubtaskSchema), (req, res, next) => taskController.createSubtask(req, res, next));
router.patch('/:parentId/reorder', authenticate, requirePermission('tasks:manage'), validate(reorderSubtasksSchema), (req, res, next) => taskController.reorderSubtasks(req, res, next));

export default router;
