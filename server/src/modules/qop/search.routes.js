import { Router } from 'express';
import searchController from './search.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  searchDocumentsSchema,
  customerDocumentsSchema,
  projectDocumentsSchema,
  invoiceAgingSchema,
  quotationPipelineSchema,
} from './search.validation.js';

const router = Router();

// Cross-document search
router.get(
  '/search',
  authenticate,
  requirePermission('quotations:read'),
  validate(searchDocumentsSchema),
  (req, res, next) => searchController.searchDocuments(req, res, next),
);

// Customer documents
router.get(
  '/customer/:customerId',
  authenticate,
  requirePermission('quotations:read'),
  validate(customerDocumentsSchema),
  (req, res, next) => searchController.getCustomerDocuments(req, res, next),
);

// Project documents
router.get(
  '/project/:projectId',
  authenticate,
  requirePermission('quotations:read'),
  validate(projectDocumentsSchema),
  (req, res, next) => searchController.getProjectDocuments(req, res, next),
);

// Invoice aging report
router.get(
  '/invoices/aging',
  authenticate,
  requirePermission('invoicing:read'),
  validate(invoiceAgingSchema),
  (req, res, next) => searchController.getInvoiceAging(req, res, next),
);

// Quotation pipeline report
router.get(
  '/quotations/pipeline',
  authenticate,
  requirePermission('quotations:read'),
  validate(quotationPipelineSchema),
  (req, res, next) => searchController.getQuotationPipeline(req, res, next),
);

// Search presets
router.get('/search/presets', authenticate, (req, res, next) => searchController.listPresets(req, res, next));
router.post('/search/presets', authenticate, (req, res, next) => searchController.createPreset(req, res, next));
router.delete('/search/presets/:presetId', authenticate, (req, res, next) => searchController.deletePreset(req, res, next));

// CSV export
router.get('/search/export', authenticate, (req, res, next) => searchController.exportDocuments(req, res, next));

export default router;
