import { Router } from 'express';
import multer from 'multer';
import photoController from './photo.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  uploadPhotoSchema,
  listPhotosSchema,
  deletePhotoSchema,
} from './photo.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Nested router for routes under /orders/:id/photos
const photoOrderRouter = Router({ mergeParams: true });

photoOrderRouter.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  upload.single('photo'),
  validate(uploadPhotoSchema),
  (req, res, next) => photoController.upload(req, res, next),
);

photoOrderRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listPhotosSchema),
  (req, res, next) => photoController.listByOrder(req, res, next),
);

// Standalone router for routes under /photos
const photoRouter = Router();

photoRouter.delete(
  '/:photoId',
  authenticate,
  requirePermission('mobile:write'),
  validate(deletePhotoSchema),
  (req, res, next) => photoController.delete(req, res, next),
);

export { photoOrderRouter, photoRouter };
