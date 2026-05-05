import { Router } from 'express';
import taskNoteController from './taskNote.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listNotesSchema, createNoteSchema, updateNoteSchema, deleteNoteSchema,
} from './taskNote.validation.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('tasks:read'), validate(listNotesSchema), (req, res, next) => taskNoteController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:write'), validate(createNoteSchema), (req, res, next) => taskNoteController.create(req, res, next));
router.put('/:noteId', authenticate, requirePermission('tasks:write'), validate(updateNoteSchema), (req, res, next) => taskNoteController.update(req, res, next));
router.delete('/:noteId', authenticate, requirePermission('tasks:write'), validate(deleteNoteSchema), (req, res, next) => taskNoteController.remove(req, res, next));

export default router;
