import { Router } from 'express';
import templateController from './template.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listTemplatesSchema, templateIdParamSchema, updateTemplateSchema,
  versionParamSchema, previewSchema, createTemplateSchema,
  compareVersionsSchema, revertTemplateSchema,
} from './template.validation.js';

const router = Router();

// Create
router.post('/', authenticate, requirePermission('templates:write'), validate(createTemplateSchema), (req, res, next) => templateController.create(req, res, next));

// List & detail
router.get('/', authenticate, requirePermission('templates:read'), validate(listTemplatesSchema), (req, res, next) => templateController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('templates:read'), validate(templateIdParamSchema), (req, res, next) => templateController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('templates:write'), validate(updateTemplateSchema), (req, res, next) => templateController.update(req, res, next));
router.post('/:id/duplicate', authenticate, requirePermission('templates:write'), validate(templateIdParamSchema), (req, res, next) => templateController.duplicate(req, res, next));
router.delete('/:id', authenticate, requirePermission('templates:delete'), validate(templateIdParamSchema), (req, res, next) => templateController.remove(req, res, next));

// Versions
router.get('/:id/versions', authenticate, requirePermission('templates:read'), validate(templateIdParamSchema), (req, res, next) => templateController.listVersions(req, res, next));
router.get('/:id/versions/compare', authenticate, requirePermission('templates:read'), validate(compareVersionsSchema), (req, res, next) => templateController.compareVersions(req, res, next));
router.get('/:id/versions/:version', authenticate, requirePermission('templates:read'), validate(versionParamSchema), (req, res, next) => templateController.getVersion(req, res, next));
router.post('/:id/versions/:version/revert', authenticate, requirePermission('templates:admin'), validate(revertTemplateSchema), (req, res, next) => templateController.revertToVersion(req, res, next));

// Preview
router.post('/:id/preview', authenticate, requirePermission('templates:read'), validate(previewSchema), (req, res, next) => templateController.preview(req, res, next));

export default router;
