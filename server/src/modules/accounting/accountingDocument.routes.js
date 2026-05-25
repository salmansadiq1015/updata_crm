import { Router } from 'express';
import multer from 'multer';
import accountingDocumentController from './accountingDocument.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  uploadDocumentSchema, documentIdParamSchema, listDocumentsSchema,
  triggerOcrSchema, confirmOcrSchema, assignSchema, bulkAssignSchema,
  rejectOcrSchema, bulkDownloadSchema, createAutoAllocationRuleSchema,
  listAutoAllocationRulesSchema, updateAutoAllocationRuleSchema,
} from './accountingDocument.validation.js';

const router = Router();
const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
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
    if (SUPPORTED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported accounting document file type'));
  },
});

// Named routes BEFORE /:id
router.post('/upload', authenticate, requirePermission('accounting:documents:manage'), upload.single('file'), validate(uploadDocumentSchema), (req, res, next) => accountingDocumentController.upload(req, res, next));
router.post('/bulk-assign', authenticate, requirePermission('accounting:documents:manage'), validate(bulkAssignSchema), (req, res, next) => accountingDocumentController.bulkAssign(req, res, next));
router.post('/bulk-download', authenticate, requirePermission('accounting:documents:read'), validate(bulkDownloadSchema), (req, res, next) => accountingDocumentController.bulkDownload(req, res, next));
router.get('/auto-allocation-rules', authenticate, requirePermission('accounting:documents:manage'), validate(listAutoAllocationRulesSchema), (req, res, next) => accountingDocumentController.listAutoAllocationRules(req, res, next));
router.post('/auto-allocation-rules', authenticate, requirePermission('accounting:documents:manage'), validate(createAutoAllocationRuleSchema), (req, res, next) => accountingDocumentController.createAutoAllocationRule(req, res, next));
router.patch('/auto-allocation-rules/:ruleId', authenticate, requirePermission('accounting:documents:manage'), validate(updateAutoAllocationRuleSchema), (req, res, next) => accountingDocumentController.updateAutoAllocationRule(req, res, next));

// Standard routes
router.get('/', authenticate, requirePermission('accounting:documents:read'), validate(listDocumentsSchema), (req, res, next) => accountingDocumentController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.getById(req, res, next));
router.get('/:id/download', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.download(req, res, next));
router.post('/:id/ocr', authenticate, requirePermission('accounting:documents:manage'), validate(triggerOcrSchema), (req, res, next) => accountingDocumentController.triggerOcr(req, res, next));
router.get('/:id/ocr/result', authenticate, requirePermission('accounting:documents:read'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.getOcrResult(req, res, next));
router.post('/:id/ocr/confirm', authenticate, requirePermission('accounting:documents:manage'), validate(confirmOcrSchema), (req, res, next) => accountingDocumentController.confirmOcr(req, res, next));
router.post('/:id/ocr/reject', authenticate, requirePermission('accounting:documents:manage'), validate(rejectOcrSchema), (req, res, next) => accountingDocumentController.rejectOcr(req, res, next));
router.post('/:id/assign', authenticate, requirePermission('accounting:documents:manage'), validate(assignSchema), (req, res, next) => accountingDocumentController.assign(req, res, next));
router.delete('/:id', authenticate, requirePermission('accounting:documents:manage'), validate(documentIdParamSchema), (req, res, next) => accountingDocumentController.delete(req, res, next));

export default router;
