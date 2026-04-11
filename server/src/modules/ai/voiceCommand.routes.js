import { Router } from 'express';
import voiceCommandController from './voiceCommand.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createCommandSchema,
  updateCommandSchema,
  commandIdParamSchema,
  listCommandsSchema,
} from './voiceCommand.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('ai:commands:manage'), validate(listCommandsSchema), (req, res, next) => voiceCommandController.list(req, res, next));
router.post('/', authenticate, requirePermission('ai:commands:manage'), validate(createCommandSchema), (req, res, next) => voiceCommandController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('ai:commands:manage'), validate(commandIdParamSchema), (req, res, next) => voiceCommandController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('ai:commands:manage'), validate(updateCommandSchema), (req, res, next) => voiceCommandController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('ai:commands:manage'), validate(commandIdParamSchema), (req, res, next) => voiceCommandController.remove(req, res, next));

export default router;
