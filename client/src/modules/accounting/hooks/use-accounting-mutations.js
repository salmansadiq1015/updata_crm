import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  accountingEntityService, chartService, journalService, apService, arService, bankService,
  cashService, reconciliationService, openItemsService, accDocService,
  exchangeRateService, fiscalPeriodService, taxService, fixedAssetService, budgetService, recurringTransactionService, inventoryAccountingService,
} from '../services/accounting-service';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';

function inv(qc, ...keys) {
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

function success(t, key, fallback) {
  toast.success(t(`accounting.toast.${key}`, fallback));
}

// ── Chart of Accounts ─────────────────────────────────────────
export function useChartMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const createAccount = useMutation({
    mutationFn: chartService.create,
    onSuccess: () => { inv(qc, ['accounting', 'accounts'], ['accounting', 'account-tree']); success(t, 'accountCreated', 'Account created'); },
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, data }) => chartService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting', 'accounts'], ['accounting', 'account-tree']); success(t, 'accountUpdated', 'Account updated'); },
  });
  return { createAccount, updateAccount };
}

// ── Journal ───────────────────────────────────────────────────
export function useJournalMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const createEntry = useMutation({
    mutationFn: journalService.create,
    onSuccess: () => { inv(qc, ['accounting', 'journal']); success(t, 'journalEntryCreated', 'Journal entry created'); },
  });
  const reverseEntry = useMutation({
    mutationFn: (id) => journalService.reverse(id),
    onSuccess: () => { inv(qc, ['accounting', 'journal']); success(t, 'entryReversed', 'Entry reversed'); },
  });
  return { createEntry, reverseEntry };
}

export function useFiscalPeriodMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'fiscal-periods'],
    ['accounting', 'dashboard'],
    ['accounting', 'journal'],
  );

  const createFiscalPeriod = useMutation({
    mutationFn: fiscalPeriodService.create,
    onSuccess: () => { invalidate(); success(t, 'fiscalPeriodCreated', 'Fiscal period created'); },
  });
  const closeFiscalPeriod = useMutation({
    mutationFn: ({ id, reason }) => fiscalPeriodService.close(id, reason),
    onSuccess: () => { invalidate(); success(t, 'fiscalPeriodClosed', 'Fiscal period closed'); },
  });
  const reopenFiscalPeriod = useMutation({
    mutationFn: ({ id, reason }) => fiscalPeriodService.reopen(id, reason),
    onSuccess: () => { invalidate(); success(t, 'fiscalPeriodReopened', 'Fiscal period reopened'); },
  });

  return { createFiscalPeriod, closeFiscalPeriod, reopenFiscalPeriod };
}

export function useExchangeRateMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const upsertExchangeRate = useMutation({
    mutationFn: exchangeRateService.upsert,
    onSuccess: () => {
      inv(qc, ['accounting', 'exchange-rates'], ['accounting', 'exchange-rate-resolve']);
      success(t, 'exchangeRateSaved', 'Exchange rate saved');
    },
  });

  const convertAmount = useMutation({
    mutationFn: exchangeRateService.convert,
  });

  const postFxRevaluation = useMutation({
    mutationFn: exchangeRateService.postRevaluation,
    onSuccess: () => {
      inv(
        qc,
        ['accounting', 'fx-revaluation-preview'],
        ['accounting', 'fx-revaluation-runs'],
        ['accounting', 'journal'],
        ['accounting', 'dashboard'],
        ['accounting', 'balance-sheet'],
        ['accounting', 'profit-loss'],
      );
      success(t, 'fxRevaluationPosted', 'FX revaluation posted');
    },
  });

  return { upsertExchangeRate, convertAmount, postFxRevaluation };
}

export function useTaxMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'tax-codes'],
    ['accounting', 'tax-summary'],
    ['accounting', 'vat-report'],
    ['accounting', 'tax-transactions'],
  );

  const createTaxCode = useMutation({
    mutationFn: taxService.createCode,
    onSuccess: () => { invalidate(); success(t, 'taxCodeCreated', 'Tax code created'); },
  });
  const updateTaxCode = useMutation({
    mutationFn: ({ id, data }) => taxService.updateCode(id, data),
    onSuccess: () => { invalidate(); success(t, 'taxCodeUpdated', 'Tax code updated'); },
  });
  const calculateTax = useMutation({
    mutationFn: taxService.calculate,
  });

  return { createTaxCode, updateTaxCode, calculateTax };
}

export function useFixedAssetMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'fixed-assets'],
    ['accounting', 'fixed-asset-summary'],
    ['accounting', 'dashboard'],
    ['accounting', 'journal'],
    ['accounting', 'balance-sheet'],
    ['accounting', 'profit-loss'],
  );

  const createFixedAsset = useMutation({
    mutationFn: fixedAssetService.create,
    onSuccess: () => { invalidate(); success(t, 'fixedAssetCreated', 'Fixed asset created'); },
  });
  const updateFixedAsset = useMutation({
    mutationFn: ({ id, data }) => fixedAssetService.update(id, data),
    onSuccess: () => { invalidate(); success(t, 'fixedAssetUpdated', 'Fixed asset updated'); },
  });
  const activateFixedAsset = useMutation({
    mutationFn: ({ id, data }) => fixedAssetService.activate(id, data),
    onSuccess: () => { invalidate(); success(t, 'fixedAssetActivated', 'Fixed asset activated'); },
  });
  const depreciateFixedAsset = useMutation({
    mutationFn: ({ id, data }) => fixedAssetService.depreciate(id, data),
    onSuccess: () => { invalidate(); success(t, 'fixedAssetDepreciated', 'Depreciation posted'); },
  });
  const disposeFixedAsset = useMutation({
    mutationFn: ({ id, data }) => fixedAssetService.dispose(id, data),
    onSuccess: () => { invalidate(); success(t, 'fixedAssetDisposed', 'Fixed asset disposed'); },
  });

  return {
    createFixedAsset,
    updateFixedAsset,
    activateFixedAsset,
    depreciateFixedAsset,
    disposeFixedAsset,
  };
}

export function useBudgetMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'budgets'],
    ['accounting', 'budget-summary'],
    ['accounting', 'budget-variance'],
    ['accounting', 'dashboard'],
    ['accounting', 'profit-loss'],
    ['accounting', 'balance-sheet'],
  );

  const createBudget = useMutation({
    mutationFn: budgetService.create,
    onSuccess: () => { invalidate(); success(t, 'budgetCreated', 'Budget created'); },
  });
  const updateBudget = useMutation({
    mutationFn: ({ id, data }) => budgetService.update(id, data),
    onSuccess: () => { invalidate(); success(t, 'budgetUpdated', 'Budget updated'); },
  });
  const approveBudget = useMutation({
    mutationFn: (id) => budgetService.approve(id),
    onSuccess: () => { invalidate(); success(t, 'budgetApproved', 'Budget approved'); },
  });
  const lockBudget = useMutation({
    mutationFn: (id) => budgetService.lock(id),
    onSuccess: () => { invalidate(); success(t, 'budgetLocked', 'Budget locked'); },
  });

  return { createBudget, updateBudget, approveBudget, lockBudget };
}

// ── AP ────────────────────────────────────────────────────────
export function useRecurringTransactionMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'recurring-transactions'],
    ['accounting', 'recurring-transaction-summary'],
    ['accounting', 'recurring-transaction-runs'],
    ['accounting', 'dashboard'],
    ['accounting', 'journal'],
    ['accounting', 'ap-invoices'],
    ['accounting', 'ar-receivables'],
    ['accounting', 'profit-loss'],
    ['accounting', 'balance-sheet'],
  );

  const createRecurringTransaction = useMutation({
    mutationFn: recurringTransactionService.create,
    onSuccess: () => { invalidate(); success(t, 'recurringCreated', 'Recurring transaction created'); },
  });
  const updateRecurringTransaction = useMutation({
    mutationFn: ({ id, data }) => recurringTransactionService.update(id, data),
    onSuccess: () => { invalidate(); success(t, 'recurringUpdated', 'Recurring transaction updated'); },
  });
  const activateRecurringTransaction = useMutation({
    mutationFn: (id) => recurringTransactionService.activate(id),
    onSuccess: () => { invalidate(); success(t, 'recurringActivated', 'Recurring transaction activated'); },
  });
  const pauseRecurringTransaction = useMutation({
    mutationFn: (id) => recurringTransactionService.pause(id),
    onSuccess: () => { invalidate(); success(t, 'recurringPaused', 'Recurring transaction paused'); },
  });
  const archiveRecurringTransaction = useMutation({
    mutationFn: (id) => recurringTransactionService.archive(id),
    onSuccess: () => { invalidate(); success(t, 'recurringArchived', 'Recurring transaction archived'); },
  });
  const runRecurringTransaction = useMutation({
    mutationFn: ({ id, data }) => recurringTransactionService.run(id, data),
    onSuccess: () => { invalidate(); success(t, 'recurringRun', 'Recurring transaction executed'); },
  });
  const runDueRecurringTransactions = useMutation({
    mutationFn: recurringTransactionService.runDue,
    onSuccess: () => { invalidate(); success(t, 'recurringRunDue', 'Due recurring transactions executed'); },
  });

  return {
    createRecurringTransaction,
    updateRecurringTransaction,
    activateRecurringTransaction,
    pauseRecurringTransaction,
    archiveRecurringTransaction,
    runRecurringTransaction,
    runDueRecurringTransactions,
  };
}

export function useInventoryAccountingMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'inventory-valuation'],
    ['accounting', 'inventory-movements'],
    ['accounting', 'inventory-entries'],
    ['accounting', 'dashboard'],
    ['accounting', 'journal'],
    ['accounting', 'balance-sheet'],
    ['accounting', 'profit-loss'],
  );

  const postInventoryMovement = useMutation({
    mutationFn: ({ movementId, data }) => inventoryAccountingService.postMovement(movementId, data),
    onSuccess: () => { invalidate(); success(t, 'inventoryMovementPosted', 'Inventory movement posted'); },
  });
  const postInventoryPeriod = useMutation({
    mutationFn: inventoryAccountingService.postPeriod,
    onSuccess: () => { invalidate(); success(t, 'inventoryPeriodPosted', 'Inventory period posted'); },
  });

  return { postInventoryMovement, postInventoryPeriod };
}

export function useApMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(qc, ['accounting', 'ap-invoices'], ['accounting', 'ap-summary'], ['accounting', 'ap-aging']);

  const createApInvoice = useMutation({
    mutationFn: apService.create,
    onSuccess: () => { invalidate(); success(t, 'apInvoiceRecorded', 'AP invoice recorded'); },
  });
  const updateApInvoice = useMutation({
    mutationFn: ({ id, data }) => apService.update(id, data),
    onSuccess: () => { invalidate(); success(t, 'apInvoiceUpdated', 'AP invoice updated'); },
  });
  const approveApInvoice = useMutation({
    mutationFn: (id) => apService.approve(id),
    onSuccess: () => { invalidate(); success(t, 'invoiceApproved', 'Invoice approved'); },
  });
  const secondApproveApInvoice = useMutation({
    mutationFn: (id) => apService.secondApprove(id),
    onSuccess: () => { invalidate(); success(t, 'secondApprovalGranted', 'Second approval granted'); },
  });
  const disputeApInvoice = useMutation({
    mutationFn: ({ id, reason }) => apService.dispute(id, reason),
    onSuccess: () => { invalidate(); success(t, 'invoiceDisputed', 'Invoice disputed'); },
  });
  const createPaymentBatch = useMutation({
    mutationFn: apService.paymentBatch,
    onSuccess: () => { invalidate(); success(t, 'paymentBatchCreated', 'Payment batch created'); },
  });
  return {
    createApInvoice, updateApInvoice,
    approveApInvoice, secondApproveApInvoice, disputeApInvoice,
    createPaymentBatch,
  };
}

// ── AR ────────────────────────────────────────────────────────
export function useArMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(qc, ['accounting', 'ar-receivables'], ['accounting', 'ar-summary'], ['accounting', 'ar-payments']);

  const recordPayment = useMutation({
    mutationFn: arService.recordPayment,
    onSuccess: () => { invalidate(); success(t, 'paymentRecorded', 'Payment recorded'); },
  });
  const recordInvoicePayment = useMutation({
    mutationFn: arService.recordAndAllocateInvoicePayment,
    onSuccess: () => { invalidate(); success(t, 'paymentRecordedAllocated', 'Payment recorded and allocated'); },
  });
  const allocatePayment = useMutation({
    mutationFn: ({ id, data }) => arService.allocatePayment(id, data),
    onSuccess: () => { invalidate(); success(t, 'paymentAllocated', 'Payment allocated'); },
  });
  const writeOff = useMutation({
    mutationFn: ({ id, reason }) => arService.writeOff(id, reason),
    onSuccess: () => { invalidate(); success(t, 'writtenOff', 'Written off'); },
  });
  const generateDunning = useMutation({
    mutationFn: arService.generateDunning,
    onSuccess: () => { inv(qc, ['accounting', 'ar-overdue']); success(t, 'dunningLettersGenerated', 'Dunning letters generated'); },
  });
  return { recordPayment, recordInvoicePayment, allocatePayment, writeOff, generateDunning };
}

// ── Bank ──────────────────────────────────────────────────────
export function useBankMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const createBankAccount = useMutation({
    mutationFn: bankService.create,
    onSuccess: () => { inv(qc, ['accounting']); success(t, 'bankAccountAdded', 'Bank account added'); },
  });
  const updateBankAccount = useMutation({
    mutationFn: ({ id, data }) => bankService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting']); success(t, 'bankAccountUpdated', 'Bank account updated'); },
  });
  const importStatement = useMutation({
    mutationFn: bankService.importStatement,
    onSuccess: () => { inv(qc, ['accounting']); success(t, 'statementImported', 'Statement imported'); },
  });
  const importPaymentStatus = useMutation({
    mutationFn: bankService.importPaymentStatus,
    onSuccess: () => { inv(qc, ['accounting']); success(t, 'paymentStatusImported', 'Payment status imported'); },
  });
  const retrieveStatements = useMutation({
    mutationFn: bankService.retrieve,
    onSuccess: () => {
      inv(qc, ['accounting']);
      success(t, 'bankRetrievalCompleted', 'Bank retrieval completed');
    },
  });
  return { createBankAccount, updateBankAccount, importStatement, importPaymentStatus, retrieveStatements };
}

// â”€â”€ Cash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useCashMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const updateManualBalance = useMutation({
    mutationFn: cashService.manualBalance,
    onSuccess: () => {
      inv(qc, ['accounting', 'cash-balances'], ['accounting', 'cash-forecast'], ['accounting', 'bank-accounts']);
      success(t, 'balanceUpdated', 'Balance updated');
    },
  });
  return { updateManualBalance };
}

// â”€â”€ Reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useReconciliationMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'bank-analytics'],
    ['accounting', 'dashboard'],
    ['accounting', 'reconciliation-unmatched'],
    ['accounting', 'reconciliation-report'],
    ['accounting', 'bank-transactions'],
    ['accounting', 'ar-receivables'],
    ['accounting', 'ap-invoices'],
    ['accounting', 'journal'],
  );

  const runReconciliation = useMutation({
    mutationFn: reconciliationService.run,
    onSuccess: () => { invalidate(); success(t, 'reconciliationCompleted', 'Reconciliation completed'); },
  });
  const matchAr = useMutation({
    mutationFn: reconciliationService.matchAr,
    onSuccess: () => { invalidate(); success(t, 'arTransactionMatched', 'AR transaction matched'); },
  });
  const matchAp = useMutation({
    mutationFn: reconciliationService.matchAp,
    onSuccess: () => { invalidate(); success(t, 'apTransactionMatched', 'AP transaction matched'); },
  });
  const categorize = useMutation({
    mutationFn: reconciliationService.categorize,
    onSuccess: () => { invalidate(); success(t, 'transactionCategorized', 'Transaction categorized'); },
  });

  return { runReconciliation, matchAr, matchAp, categorize };
}

// â”€â”€ Open Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useOpenItemMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(qc, ['accounting', 'open-items'], ['accounting', 'open-items-aging'], ['accounting', 'ar-receivables'], ['accounting', 'ap-invoices']);
  const generateStatement = useMutation({
    mutationFn: ({ entityId, params, data }) => openItemsService.statement(entityId, params, data),
    onSuccess: () => { inv(qc, ['accounting', 'documents']); success(t, 'statementGenerated', 'Statement generated'); },
  });
  const netItems = useMutation({
    mutationFn: openItemsService.netItems,
    onSuccess: () => { invalidate(); success(t, 'itemsNetted', 'Items netted'); },
  });
  return { generateStatement, netItems };
}

// â”€â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useAccDocumentMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(qc, ['accounting', 'documents']);
  const uploadDocument = useMutation({
    mutationFn: ({ file, meta }) => accDocService.upload(file, meta),
    onSuccess: () => { invalidate(); success(t, 'documentUploaded', 'Document uploaded'); },
  });
  const triggerOcr = useMutation({
    mutationFn: accDocService.triggerOcr,
    onSuccess: () => { invalidate(); success(t, 'ocrQueued', 'OCR queued'); },
  });
  const confirmOcr = useMutation({
    mutationFn: ({ id, data }) => accDocService.confirmOcr(id, data),
    onSuccess: () => {
      invalidate();
      inv(qc, ['accounting', 'document-ocr-result'], ['accounting', 'ap-invoices']);
      success(t, 'ocrConfirmed', 'OCR confirmed');
    },
  });
  const rejectOcr = useMutation({
    mutationFn: ({ id, data }) => accDocService.rejectOcr(id, data),
    onSuccess: () => { invalidate(); inv(qc, ['accounting', 'document-ocr-result']); success(t, 'ocrRejected', 'OCR rejected'); },
  });
  const assignDocument = useMutation({
    mutationFn: ({ id, data }) => accDocService.assign(id, data),
    onSuccess: () => { invalidate(); success(t, 'documentAssigned', 'Document assigned'); },
  });
  const bulkAssignDocuments = useMutation({
    mutationFn: accDocService.bulkAssign,
    onSuccess: () => { invalidate(); success(t, 'documentAssigned', 'Document assigned'); },
  });
  return { uploadDocument, triggerOcr, confirmOcr, rejectOcr, assignDocument, bulkAssignDocuments };
}

export function useAccountingEntityMutations() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const invalidate = () => inv(
    qc,
    ['accounting', 'entities'],
    ['accounting', 'dashboard'],
    ['accounting', 'journal'],
    ['accounting', 'profit-loss'],
    ['accounting', 'balance-sheet'],
    ['accounting', 'trial-balance'],
    ['accounting', 'cash-flow'],
  );

  const createAccountingEntity = useMutation({
    mutationFn: accountingEntityService.create,
    onSuccess: () => { invalidate(); success(t, 'entityCreated', 'Accounting entity created'); },
  });
  const updateAccountingEntity = useMutation({
    mutationFn: ({ id, data }) => accountingEntityService.update(id, data),
    onSuccess: () => { invalidate(); success(t, 'entityUpdated', 'Accounting entity updated'); },
  });
  const activateAccountingEntity = useMutation({
    mutationFn: (id) => accountingEntityService.activate(id),
    onSuccess: () => { invalidate(); success(t, 'entityActivated', 'Accounting entity activated'); },
  });
  const deactivateAccountingEntity = useMutation({
    mutationFn: (id) => accountingEntityService.deactivate(id),
    onSuccess: () => { invalidate(); success(t, 'entityDeactivated', 'Accounting entity deactivated'); },
  });

  return {
    createAccountingEntity,
    updateAccountingEntity,
    activateAccountingEntity,
    deactivateAccountingEntity,
  };
}
