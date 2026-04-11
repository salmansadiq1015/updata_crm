import { Router } from 'express';
import multer from 'multer';
import ciController from './ci.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { updateCIConfigSchema, uploadAssetSchema, deleteAssetSchema } from './ci.validation.js';
import config from '../../config/index.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize },
});

// CI Configuration
router.get('/', authenticate, requirePermission('templates:read'), (req, res, next) => ciController.getActiveConfig(req, res, next));
router.put('/', authenticate, requirePermission('templates:admin'), validate(updateCIConfigSchema), (req, res, next) => ciController.updateConfig(req, res, next));

// CI Assets
router.post('/assets', authenticate, requirePermission('templates:admin'), upload.single('file'), validate(uploadAssetSchema), (req, res, next) => ciController.uploadAsset(req, res, next));
router.get('/assets', authenticate, requirePermission('templates:read'), (req, res, next) => ciController.listAssets(req, res, next));
router.delete('/assets/:id', authenticate, requirePermission('templates:admin'), validate(deleteAssetSchema), (req, res, next) => ciController.deleteAsset(req, res, next));

export default router;
