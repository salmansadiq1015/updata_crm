import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chartService, journalService, apService, arService, bankService,
  cashService, reconciliationService, openItemsService, accDocService,
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

// ── AP ────────────────────────────────────────────────────────
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
    onSuccess: () => { inv(qc, ['accounting', 'bank-accounts']); success(t, 'bankAccountAdded', 'Bank account added'); },
  });
  const updateBankAccount = useMutation({
    mutationFn: ({ id, data }) => bankService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting', 'bank-accounts']); success(t, 'bankAccountUpdated', 'Bank account updated'); },
  });
  const importStatement = useMutation({
    mutationFn: bankService.importStatement,
    onSuccess: () => { inv(qc, ['accounting', 'bank-transactions']); success(t, 'statementImported', 'Statement imported'); },
  });
  const importPaymentStatus = useMutation({
    mutationFn: bankService.importPaymentStatus,
    onSuccess: () => { inv(qc, ['accounting', 'ap-invoices']); success(t, 'paymentStatusImported', 'Payment status imported'); },
  });
  const retrieveStatements = useMutation({
    mutationFn: bankService.retrieve,
    onSuccess: () => {
      inv(qc, ['accounting', 'bank-transactions'], ['accounting', 'bank-accounts'], ['accounting', 'cash-balances'], ['accounting', 'cash-forecast']);
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
    ['accounting', 'reconciliation-unmatched'],
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
    onSuccess: () => { invalidate(); inv(qc, ['accounting', 'document-ocr-result']); success(t, 'ocrConfirmed', 'OCR confirmed'); },
  });
  const rejectOcr = useMutation({
    mutationFn: ({ id, data }) => accDocService.rejectOcr(id, data),
    onSuccess: () => { invalidate(); inv(qc, ['accounting', 'document-ocr-result']); success(t, 'ocrRejected', 'OCR rejected'); },
  });
  const assignDocument = useMutation({
    mutationFn: ({ id, data }) => accDocService.assign(id, data),
    onSuccess: () => { invalidate(); success(t, 'documentAssigned', 'Document assigned'); },
  });
  return { uploadDocument, triggerOcr, confirmOcr, rejectOcr, assignDocument };
}
