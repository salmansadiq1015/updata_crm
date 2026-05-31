import { Router } from 'express';
import multer from 'multer';
import receiptController from './receipt.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadReceiptSchema } from './receipt.validation.js';

const SUPPORTED_RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'text/plain',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (SUPPORTED_RECEIPT_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported receipt file type'));
  },
});

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  upload.single('file'),
  validate(uploadReceiptSchema),
  (req, res, next) => receiptController.upload(req, res, next),
);

export default router;
