import { Router } from 'express';
import emailTemplateController from './emailTemplate.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listEmailTemplatesSchema, emailTemplateIdParamSchema, updateEmailTemplateSchema,
} from './emailTemplate.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('templates:read'), (req, res, next) => emailTemplateController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('templates:read'), validate(emailTemplateIdParamSchema), (req, res, next) => emailTemplateController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('templates:write'), validate(updateEmailTemplateSchema), (req, res, next) => emailTemplateController.update(req, res, next));

export default router;
