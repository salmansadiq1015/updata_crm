import { Router } from 'express';
import multer from 'multer';
import articleController from './article.controller.js';
import articleImageController from './articleImage.controller.js';
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

// Multer: memory storage for import files and image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize },
});

// Multer for image uploads: 2 MB limit, images bucket
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Accepted: jpeg, png, webp`));
    }
  },
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

// Article images
router.get('/:articleId/images', authenticate, requirePermission('catalog:read'), (req, res, next) => articleImageController.list(req, res, next));
router.post('/:articleId/images', authenticate, requirePermission('catalog:write'), uploadImage.single('image'), (req, res, next) => articleImageController.upload(req, res, next));
router.delete('/:articleId/images/:imageId', authenticate, requirePermission('catalog:delete'), (req, res, next) => articleImageController.remove(req, res, next));

export default router;
