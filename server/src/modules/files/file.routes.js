import { Router } from 'express';
import multer from 'multer';
import fileController from './file.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { uploadSchema, getByIdSchema, listSchema } from './file.validation.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import { authenticate } from '../../shared/middleware/authenticate.js';
import config from '../../config/index.js';

const router = Router();

// Multer: memory storage for S3 upload pipeline
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize },
});

// POST /api/v1/files/upload — Upload file
router.post(
  '/upload',
  uploadLimiter,
  upload.single('file'),
  validate(uploadSchema),
  (req, res, next) => fileController.upload(req, res, next),
);

// GET /api/v1/files — List files (cursor-paginated, filtered)
router.get(
  '/',
  validate(listSchema),
  (req, res, next) => fileController.list(req, res, next),
);

// GET /api/v1/files/:id — Get file metadata
router.get(
  '/:id',
  validate(getByIdSchema),
  (req, res, next) => fileController.getById(req, res, next),
);

// GET /api/v1/files/:id/download — Get pre-signed download URL
router.get(
  '/:id/download',
  authenticate,
  validate(getByIdSchema),
  (req, res, next) => fileController.download(req, res, next),
);

// DELETE /api/v1/files/:id — Soft-delete file
router.delete(
  '/:id',
  validate(getByIdSchema),
  (req, res, next) => fileController.delete(req, res, next),
);

export default router;
