import { Router } from 'express';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import controller from './quotationTemplate.controller.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateIdParamSchema,
  listTemplatesSchema,
} from './quotationTemplate.validation.js';

const router = Router();
router.use(authenticate);

router.get('/categories', (req, res, next) => controller.listCategories(req, res, next));
router.get('/', validate(listTemplatesSchema), (req, res, next) => controller.list(req, res, next));
router.get('/:id', validate(templateIdParamSchema), (req, res, next) => controller.getById(req, res, next));
router.post('/', validate(createTemplateSchema), (req, res, next) => controller.create(req, res, next));
router.put('/:id', validate(updateTemplateSchema), (req, res, next) => controller.update(req, res, next));
router.delete('/:id', validate(templateIdParamSchema), (req, res, next) => controller.remove(req, res, next));
router.post('/:id/use', validate(templateIdParamSchema), (req, res, next) => controller.incrementUsage(req, res, next));

export default router;
