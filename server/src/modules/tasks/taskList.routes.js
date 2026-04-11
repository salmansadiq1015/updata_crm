import { Router } from 'express';
import taskListController from './taskList.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTaskListSchema, updateTaskListSchema, listIdParamSchema,
  archiveSchema, reorderSchema, addMemberSchema, updateMemberRoleSchema,
  memberParamsSchema,
} from './taskList.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('tasks:lists:manage'), (req, res, next) => taskListController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:lists:manage'), validate(createTaskListSchema), (req, res, next) => taskListController.create(req, res, next));
router.patch('/reorder', authenticate, requirePermission('tasks:lists:manage'), validate(reorderSchema), (req, res, next) => taskListController.reorder(req, res, next));
router.get('/:id', authenticate, requirePermission('tasks:lists:manage'), validate(listIdParamSchema), (req, res, next) => taskListController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('tasks:lists:manage'), validate(updateTaskListSchema), (req, res, next) => taskListController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('tasks:lists:manage'), validate(listIdParamSchema), (req, res, next) => taskListController.remove(req, res, next));
router.patch('/:id/archive', authenticate, requirePermission('tasks:lists:manage'), validate(archiveSchema), (req, res, next) => taskListController.archive(req, res, next));
router.patch('/:id/unarchive', authenticate, requirePermission('tasks:lists:manage'), validate(archiveSchema), (req, res, next) => taskListController.unarchive(req, res, next));
router.get('/:id/members', authenticate, requirePermission('tasks:lists:manage'), validate(listIdParamSchema), (req, res, next) => taskListController.getMembers(req, res, next));
router.post('/:id/members', authenticate, requirePermission('tasks:lists:manage'), validate(addMemberSchema), (req, res, next) => taskListController.addMember(req, res, next));
router.put('/:id/members/:userId', authenticate, requirePermission('tasks:lists:manage'), validate(updateMemberRoleSchema), (req, res, next) => taskListController.updateMemberRole(req, res, next));
router.delete('/:id/members/:userId', authenticate, requirePermission('tasks:lists:manage'), validate(memberParamsSchema), (req, res, next) => taskListController.removeMember(req, res, next));
router.post('/:id/leave', authenticate, requirePermission('tasks:lists:manage'), validate(listIdParamSchema), (req, res, next) => taskListController.leave(req, res, next));
router.post('/:id/transfer-ownership', authenticate, requirePermission('tasks:lists:manage'), validate(listIdParamSchema), (req, res, next) => taskListController.transferOwnership(req, res, next));

export default router;
