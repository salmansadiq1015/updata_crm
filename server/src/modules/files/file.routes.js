import { Router } from 'express';
import multer from 'multer';
import fileController from './file.controller.js';
import { validate } from '../../shared/validation/validate.js';
import {
  uploadSchema,
  getByIdSchema,
  listSchema,
  organizeSchema,
  listFoldersSchema,
  createFolderSchema,
  folderIdSchema,
} from './file.validation.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
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
  authenticate,
  requirePermission('files:upload'),
  uploadLimiter,
  upload.single('file'),
  validate(uploadSchema),
  (req, res, next) => fileController.upload(req, res, next),
);

// GET /api/v1/files — List files (cursor-paginated, filtered)
router.get(
  '/',
  authenticate,
  requirePermission('files:list'),
  validate(listSchema),
  (req, res, next) => fileController.list(req, res, next),
);

// GET /api/v1/files/folders — List document folders
router.get(
  '/folders',
  authenticate,
  requirePermission('files:list'),
  validate(listFoldersSchema),
  (req, res, next) => fileController.listFolders(req, res, next),
);

// POST /api/v1/files/folders — Create a manual document folder
router.post(
  '/folders',
  authenticate,
  requirePermission('files:upload'),
  validate(createFolderSchema),
  (req, res, next) => fileController.createFolder(req, res, next),
);

// DELETE /api/v1/files/folders/:id — Delete a manual folder
router.delete(
  '/folders/:id',
  authenticate,
  requirePermission('files:delete'),
  validate(folderIdSchema),
  (req, res, next) => fileController.deleteFolder(req, res, next),
);

// GET /api/v1/files/:id — Get file metadata
router.get(
  '/:id',
  authenticate,
  requirePermission('files:view'),
  validate(getByIdSchema),
  (req, res, next) => fileController.getById(req, res, next),
);

// PATCH /api/v1/files/:id/organize — Move/reclassify file metadata
router.patch(
  '/:id/organize',
  authenticate,
  requirePermission('files:upload'),
  validate(organizeSchema),
  (req, res, next) => fileController.organize(req, res, next),
);

// GET /api/v1/files/:id/download — Get pre-signed download URL
router.get(
  '/:id/download',
  authenticate,
  requirePermission('files:view'),
  validate(getByIdSchema),
  (req, res, next) => fileController.download(req, res, next),
);

// DELETE /api/v1/files/:id — Soft-delete file
router.delete(
  '/:id',
  authenticate,
  requirePermission('files:delete'),
  validate(getByIdSchema),
  (req, res, next) => fileController.delete(req, res, next),
);

export default router;
