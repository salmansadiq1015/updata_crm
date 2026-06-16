import { Router } from 'express';
import multer from 'multer';
import procurementController from './procurement.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  deliveryNoteUploadSchema,
  deliveryNoteJobIdParamSchema,
  confirmDeliveryNoteOcrSchema,
} from './procurement.validation.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/delivery-note/ocr', authenticate, requirePermission('crm:write'), upload.single('file'), validate(deliveryNoteUploadSchema), (req, res, next) => procurementController.uploadDeliveryNote(req, res, next));
router.get('/delivery-note/:jobId/result', authenticate, requirePermission('crm:read'), validate(deliveryNoteJobIdParamSchema), (req, res, next) => procurementController.getDeliveryNoteOcrResult(req, res, next));
router.post('/delivery-note/:jobId/confirm', authenticate, requirePermission('crm:write'), validate(confirmDeliveryNoteOcrSchema), (req, res, next) => procurementController.confirmDeliveryNoteOcr(req, res, next));

export default router;
