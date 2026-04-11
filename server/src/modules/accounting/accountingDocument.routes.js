import { Router } from 'express';
import accountingDocumentController from './accountingDocument.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  uploadDocumentSchema, documentIdParamSchema, listDocumentsSchema,
  triggerOcrSchema, confirmOcrSchema, assignSchema, bulkAssignSchema,
} from './accountingDocument.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.post('/upload', authenticate, requirePermission('accounting:documents:manage'), validate(uploadDocumentSchema), (req, res, next) => accountingDocumentController.upload(req, res, next));
router.post('/bulk-assign', authenticate, requirePermission('accounting:documents:manage'), validate(bulkAssignSchema), (req, res, next) => accountingDocumentController.bulkAssign(req, res, next));

// Standard routes
router.get('/', authenticate, requirePermission('accounting:documents:read'), validate(listDocumentsSchema), (req, res, next) => accountingDocumentController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.getById(req, res, next));
router.get('/:id/download', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.download(req, res, next));
router.post('/:id/ocr', authenticate, requirePermission('accounting:documents:manage'), validate(triggerOcrSchema), (req, res, next) => accountingDocumentController.triggerOcr(req, res, next));
router.get('/:id/ocr/result', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.getOcrResult(req, res, next));
router.post('/:id/ocr/confirm', authenticate, requirePermission('accounting:documents:manage'), validate(confirmOcrSchema), (req, res, next) => accountingDocumentController.confirmOcr(req, res, next));
router.post('/:id/assign', authenticate, requirePermission('accounting:documents:manage'), validate(assignSchema), (req, res, next) => accountingDocumentController.assign(req, res, next));

export default router;
