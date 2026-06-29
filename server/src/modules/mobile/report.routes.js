import { Router } from 'express';
import multer from 'multer';
import reportController from './report.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import config from '../../config/index.js';
import {
  createReportSchema,
  generateReportSchema,
  updateReportSchema,
  reportIdParamSchema,
  submitReportSchema,
  rejectReportSchema,
  markInvoicedSchema,
  createInvoiceFromReportSchema,
  reportHistorySchema,
  listReportsQuerySchema,
  reportExportQuerySchema,
  reportImportSchema,
  bulkReportIdsSchema,
} from './report.validation.js';

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(config.storage.maxFileSize, 2 * 1024 * 1024) },
  fileFilter(_req, file, cb) {
    const name = `${file.originalname || ''}`.toLowerCase();
    const mime = `${file.mimetype || ''}`.toLowerCase();
    const allowed = name.endsWith('.csv') || mime.includes('csv') || mime === 'text/plain' || mime === 'application/vnd.ms-excel';
    cb(allowed ? null : new Error('Only CSV report import files are supported.'), allowed);
  },
});

// Nested router for routes under /orders/:id
const reportOrderRouter = Router({ mergeParams: true });

reportOrderRouter.get(
  '/reports',
  authenticate,
  requirePermission('mobile:read'),
  (req, res, next) => reportController.listByOrder(req, res, next),
);

reportOrderRouter.post(
  '/reports/generate',
  authenticate,
  requirePermission('mobile:write'),
  validate(generateReportSchema),
  (req, res, next) => reportController.generate(req, res, next),
);

reportOrderRouter.post(
  '/reports',
  authenticate,
  requirePermission('mobile:write'),
  validate(createReportSchema),
  (req, res, next) => reportController.create(req, res, next),
);

// Standalone router for routes under /reports
const reportRouter = Router();

reportRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listReportsQuerySchema),
  (req, res, next) => reportController.list(req, res, next),
);

reportRouter.get(
  '/summary',
  authenticate,
  requirePermission('mobile:read'),
  validate(listReportsQuerySchema),
  (req, res, next) => reportController.summary(req, res, next),
);

reportRouter.get(
  '/export',
  authenticate,
  requirePermission('mobile:read'),
  validate(reportExportQuerySchema),
  (req, res, next) => reportController.exportCsv(req, res, next),
);

reportRouter.get(
  '/import/template',
  authenticate,
  requirePermission('mobile:read'),
  (req, res, next) => reportController.importTemplate(req, res, next),
);

reportRouter.post(
  '/import',
  authenticate,
  requirePermission('mobile:write'),
  importUpload.single('file'),
  validate(reportImportSchema),
  (req, res, next) => reportController.importCsv(req, res, next),
);

// Bulk operations (before /:reportId to avoid param conflict)
reportRouter.post(
  '/bulk-delete',
  authenticate,
  requirePermission('mobile:write'),
  validate(bulkReportIdsSchema),
  (req, res, next) => reportController.bulkDelete(req, res, next),
);

reportRouter.post(
  '/bulk-archive',
  authenticate,
  requirePermission('mobile:write'),
  validate(bulkReportIdsSchema),
  (req, res, next) => reportController.bulkArchive(req, res, next),
);

reportRouter.get(
  '/:reportId',
  authenticate,
  requirePermission('mobile:read'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.getById(req, res, next),
);

reportRouter.put(
  '/:reportId',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateReportSchema),
  (req, res, next) => reportController.update(req, res, next),
);

reportRouter.delete(
  '/:reportId',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.delete(req, res, next),
);

reportRouter.patch(
  '/:reportId/archive',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.archive(req, res, next),
);

reportRouter.patch(
  '/:reportId/unarchive',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.unarchive(req, res, next),
);

reportRouter.post(
  '/:reportId/submit',
  authenticate,
  requirePermission('mobile:write'),
  validate(submitReportSchema),
  (req, res, next) => reportController.submit(req, res, next),
);

reportRouter.post(
  '/:reportId/approve',
  authenticate,
  requirePermission('mobile:write'),
  validate(submitReportSchema),
  (req, res, next) => reportController.approve(req, res, next),
);

reportRouter.post(
  '/:reportId/reject',
  authenticate,
  requirePermission('mobile:write'),
  validate(rejectReportSchema),
  (req, res, next) => reportController.reject(req, res, next),
);

reportRouter.post(
  '/:reportId/mark-invoiced',
  authenticate,
  requirePermission('invoicing:write'),
  validate(markInvoicedSchema),
  (req, res, next) => reportController.markInvoiced(req, res, next),
);

reportRouter.post(
  '/:reportId/create-invoice',
  authenticate,
  requirePermission('invoicing:write'),
  validate(createInvoiceFromReportSchema),
  (req, res, next) => reportController.createInvoice(req, res, next),
);

reportRouter.get(
  '/:reportId/history',
  authenticate,
  requirePermission('mobile:read'),
  validate(reportHistorySchema),
  (req, res, next) => reportController.history(req, res, next),
);

export { reportOrderRouter, reportRouter };
