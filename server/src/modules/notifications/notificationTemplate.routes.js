import { Router } from 'express';
import notificationTemplateController from './notificationTemplate.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateIdParamSchema,
  listTemplatesSchema,
  previewTemplateSchema,
} from './notificationTemplate.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:templates:manage'), validate(listTemplatesSchema), (req, res, next) => notificationTemplateController.list(req, res, next));
router.post('/', authenticate, requirePermission('notifications:templates:manage'), validate(createTemplateSchema), (req, res, next) => notificationTemplateController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('notifications:templates:manage'), validate(templateIdParamSchema), (req, res, next) => notificationTemplateController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('notifications:templates:manage'), validate(updateTemplateSchema), (req, res, next) => notificationTemplateController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('notifications:templates:manage'), validate(templateIdParamSchema), (req, res, next) => notificationTemplateController.remove(req, res, next));
router.post('/:id/preview', authenticate, requirePermission('notifications:templates:manage'), validate(previewTemplateSchema), (req, res, next) => notificationTemplateController.preview(req, res, next));

export default router;
