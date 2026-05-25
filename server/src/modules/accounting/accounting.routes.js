import { Router } from 'express';
import accountRoutes from './account.routes.js';
import accountMappingRoutes from './accountMapping.routes.js';
import journalEntryRoutes from './journalEntry.routes.js';
import arReceivablesRoutes from './arReceivables.routes.js';
import apInvoiceRoutes from './apInvoice.routes.js';
import accountingDocumentRoutes from './accountingDocument.routes.js';
import bankingRoutes from './banking.routes.js';
import reconciliationRoutes from './reconciliation.routes.js';
import cashManagementRoutes from './cashManagement.routes.js';
import openItemsRoutes from './openItems.routes.js';

/**
 * Accounting route aggregator.
 * Mounts all accounting sub-routers under /api/v1/accounting.
 *
 * URL structure:
 *   /api/v1/accounting/accounts            — chart of accounts CRUD
 *   /api/v1/accounting/journal             — journal entries
 *   /api/v1/accounting/ar                  — AR receivables, payments, dunning
 *   /api/v1/accounting/ap/invoices         — AP invoice CRUD + workflows
 *   /api/v1/accounting/documents           — accounting document management + OCR
 *   /api/v1/accounting/bank                — bank accounts + transactions + statements
 *   /api/v1/accounting/reconciliation      — bank reconciliation
 *   /api/v1/accounting/cash                — cash management + forecast
 *   /api/v1/accounting/open-items          — combined AR/AP open items + aging
 */
const router = Router();

router.use('/accounts', accountRoutes);
router.use('/account-mappings', accountMappingRoutes);
router.use('/journal', journalEntryRoutes);
router.use('/ar', arReceivablesRoutes);
router.use('/ap/invoices', apInvoiceRoutes);
router.use('/documents', accountingDocumentRoutes);
router.use('/bank', bankingRoutes);
router.use('/reconciliation', reconciliationRoutes);
router.use('/cash', cashManagementRoutes);
router.use('/open-items', openItemsRoutes);

export default router;
