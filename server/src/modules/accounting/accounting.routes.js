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
import reportsRoutes from './reports.routes.js';
import fiscalPeriodRoutes from './fiscalPeriod.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import accountingSearchRoutes from './accountingSearch.routes.js';
import exchangeRateRoutes from './exchangeRate.routes.js';
import taxRoutes from './tax.routes.js';
import fixedAssetRoutes from './fixedAsset.routes.js';
import budgetRoutes from './budget.routes.js';
import recurringTransactionRoutes from './recurringTransaction.routes.js';

/**
 * Accounting route aggregator.
 * Mounts accounting sub-routers under /api/v1/accounting.
 *
 * URL structure:
 *   /api/v1/accounting/accounts       - chart of accounts CRUD
 *   /api/v1/accounting/account-mappings - posting account mappings
 *   /api/v1/accounting/journal        - journal entries
 *   /api/v1/accounting/ar             - AR receivables, payments, dunning
 *   /api/v1/accounting/ap/invoices    - AP invoice CRUD and workflows
 *   /api/v1/accounting/documents      - accounting documents and OCR
 *   /api/v1/accounting/bank           - bank accounts, transactions, imports
 *   /api/v1/accounting/reconciliation - bank reconciliation
 *   /api/v1/accounting/cash           - cash management and forecast
 *   /api/v1/accounting/open-items     - combined AR/AP open items
 *   /api/v1/accounting/reports        - financial reports
 *   /api/v1/accounting/fiscal-periods - fiscal period controls
 *   /api/v1/accounting/dashboard      - finance dashboard snapshot
 *   /api/v1/accounting/search         - global financial search
 *   /api/v1/accounting/exchange-rates - historical FX rates and conversions
 *   /api/v1/accounting/tax            - tax codes, ledger, and reports
 *   /api/v1/accounting/assets         - fixed asset register and depreciation
 *   /api/v1/accounting/budgets        - budget planning and budget-vs-actual
 *   /api/v1/accounting/recurring-transactions - recurring journals, bills, and invoices
 */
const router = Router();

router.use('/search', accountingSearchRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/tax', taxRoutes);
router.use('/assets', fixedAssetRoutes);
router.use('/budgets', budgetRoutes);
router.use('/recurring-transactions', recurringTransactionRoutes);
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
router.use('/reports', reportsRoutes);
router.use('/fiscal-periods', fiscalPeriodRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
