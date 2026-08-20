import { Router } from 'express';
import emailTemplateController from './emailTemplate.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listEmailTemplatesSchema, renderEmailTemplateSchema,
  emailTemplateIdParamSchema, createEmailTemplateSchema, updateEmailTemplateSchema,
} from './emailTemplate.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('templates:read'), validate(listEmailTemplatesSchema), (req, res, next) => emailTemplateController.list(req, res, next));
router.post('/', authenticate, requirePermission('templates:write'), validate(createEmailTemplateSchema), (req, res, next) => emailTemplateController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('templates:read'), validate(emailTemplateIdParamSchema), (req, res, next) => emailTemplateController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('templates:write'), validate(updateEmailTemplateSchema), (req, res, next) => emailTemplateController.update(req, res, next));
router.post('/:id/render', authenticate, requirePermission('templates:read'), validate(renderEmailTemplateSchema), (req, res, next) => emailTemplateController.render(req, res, next));
router.post('/:id/duplicate', authenticate, requirePermission('templates:write'), validate(emailTemplateIdParamSchema), (req, res, next) => emailTemplateController.duplicate(req, res, next));
router.delete('/:id', authenticate, requirePermission('templates:delete'), validate(emailTemplateIdParamSchema), (req, res, next) => emailTemplateController.remove(req, res, next));

export default router;
