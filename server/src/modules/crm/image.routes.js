import { Router } from 'express';
import imageController from './image.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { imageIdParamSchema } from './image.validation.js';

const router = Router();

router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(imageIdParamSchema), (req, res, next) => imageController.delete(req, res, next));

export default router;
