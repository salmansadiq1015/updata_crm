import { Router } from 'express';
import taskFolderController from './taskFolder.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTaskFolderSchema,
  updateTaskFolderSchema,
  folderIdParamSchema,
  reorderFoldersSchema,
} from './taskFolder.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('tasks:read'), (req, res, next) => taskFolderController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:write'), validate(createTaskFolderSchema), (req, res, next) => taskFolderController.create(req, res, next));
router.patch('/reorder', authenticate, requirePermission('tasks:write'), validate(reorderFoldersSchema), (req, res, next) => taskFolderController.reorder(req, res, next));
router.get('/:id', authenticate, requirePermission('tasks:read'), validate(folderIdParamSchema), (req, res, next) => taskFolderController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('tasks:write'), validate(updateTaskFolderSchema), (req, res, next) => taskFolderController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('tasks:delete'), validate(folderIdParamSchema), (req, res, next) => taskFolderController.remove(req, res, next));

export default router;
