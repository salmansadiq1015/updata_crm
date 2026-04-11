import { Router } from 'express';
import noteController from './note.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { updateNoteSchema, noteIdParamSchema } from './note.validation.js';

const router = Router();

router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateNoteSchema), (req, res, next) => noteController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(noteIdParamSchema), (req, res, next) => noteController.delete(req, res, next));

export default router;
