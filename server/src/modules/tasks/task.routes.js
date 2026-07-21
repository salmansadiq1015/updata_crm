import { Router } from 'express';
import taskController from './task.controller.js';
import { validate } from '../../shared/validation/validate.js';
import taskNoteRoutes from './taskNote.routes.js';
import taskAttachmentRoutes from './taskAttachment.routes.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTaskSchema, updateTaskSchema, taskIdParamSchema,
  listTasksSchema, changeStatusSchema, completeTaskSchema,
  moveTaskSchema, bulkOperationSchema, createSubtaskSchema,
  parentIdParamSchema, reorderSubtasksSchema, promoteTaskSchema,
  batchPatchSchema, setLockSchema,
} from './task.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('tasks:read'), validate(listTasksSchema), (req, res, next) => taskController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:write'), validate(createTaskSchema), (req, res, next) => taskController.create(req, res, next));
router.post('/bulk', authenticate, requirePermission('tasks:write'), validate(bulkOperationSchema), (req, res, next) => taskController.bulkOperation(req, res, next));
router.patch('/batch', authenticate, requirePermission('tasks:write'), validate(batchPatchSchema), (req, res, next) => taskController.batchPatch(req, res, next));
router.get('/:id', authenticate, requirePermission('tasks:read'), validate(taskIdParamSchema), (req, res, next) => taskController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('tasks:write'), validate(updateTaskSchema), (req, res, next) => taskController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('tasks:delete'), validate(taskIdParamSchema), (req, res, next) => taskController.remove(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('tasks:write'), validate(changeStatusSchema), (req, res, next) => taskController.changeStatus(req, res, next));
router.patch('/:id/complete', authenticate, requirePermission('tasks:write'), validate(completeTaskSchema), (req, res, next) => taskController.complete(req, res, next));
router.patch('/:id/lock', authenticate, requirePermission('tasks:write'), validate(setLockSchema), (req, res, next) => taskController.setLock(req, res, next));
router.patch('/:id/reopen', authenticate, requirePermission('tasks:write'), validate(taskIdParamSchema), (req, res, next) => taskController.reopen(req, res, next));
router.patch('/:id/move', authenticate, requirePermission('tasks:write'), validate(moveTaskSchema), (req, res, next) => taskController.moveToList(req, res, next));
router.patch('/:id/promote', authenticate, requirePermission('tasks:write'), validate(promoteTaskSchema), (req, res, next) => taskController.promote(req, res, next));
router.get('/:parentId/subtasks', authenticate, requirePermission('tasks:read'), validate(parentIdParamSchema), (req, res, next) => taskController.getSubtasks(req, res, next));
router.post('/:parentId/subtasks', authenticate, requirePermission('tasks:write'), validate(createSubtaskSchema), (req, res, next) => taskController.createSubtask(req, res, next));
router.patch('/:parentId/reorder', authenticate, requirePermission('tasks:write'), validate(reorderSubtasksSchema), (req, res, next) => taskController.reorderSubtasks(req, res, next));

router.use('/:taskId/notes', taskNoteRoutes);
router.use('/:taskId/attachments', taskAttachmentRoutes);

export default router;
