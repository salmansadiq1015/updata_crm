import { Router } from 'express';
import multer from 'multer';
import articleController from './article.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createArticleSchema,
  updateArticleSchema,
  listArticlesSchema,
  articleIdParamSchema,
  articleVersionParamSchema,
  bulkImportSchema,
} from './article.validation.js';
import config from '../../config/index.js';

const router = Router();

// Multer: memory storage for import files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize },
});

// Named routes BEFORE /:id
router.post('/import', authenticate, requirePermission('catalog:admin'), upload.single('file'), validate(bulkImportSchema), (req, res, next) => articleController.bulkImport(req, res, next));
router.get('/facets', authenticate, requirePermission('catalog:read'), (req, res, next) => articleController.getFacets(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('catalog:read'), validate(listArticlesSchema), (req, res, next) => articleController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:write'), validate(createArticleSchema), (req, res, next) => articleController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('catalog:read'), validate(articleIdParamSchema), (req, res, next) => articleController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('catalog:write'), validate(updateArticleSchema), (req, res, next) => articleController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('catalog:delete'), validate(articleIdParamSchema), (req, res, next) => articleController.delete(req, res, next));

// Version history
router.get('/:id/versions', authenticate, requirePermission('catalog:read'), validate(articleIdParamSchema), (req, res, next) => articleController.getVersions(req, res, next));
router.get('/:id/versions/:ver', authenticate, requirePermission('catalog:read'), validate(articleVersionParamSchema), (req, res, next) => articleController.getVersion(req, res, next));

export default router;
