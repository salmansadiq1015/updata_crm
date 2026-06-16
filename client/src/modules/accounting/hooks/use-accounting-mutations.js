import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chartService, journalService, apService, arService, bankService,
  cashService, reconciliationService, openItemsService, accDocService,
} from '../services/accounting-service';
import toast from 'react-hot-toast';

function inv(qc, ...keys) {
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

// ── Chart of Accounts ─────────────────────────────────────────
export function useChartMutations() {
  const qc = useQueryClient();
  const createAccount = useMutation({
    mutationFn: chartService.create,
    onSuccess: () => { inv(qc, ['accounting', 'accounts'], ['accounting', 'account-tree']); toast.success('Account created'); },
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, data }) => chartService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting', 'accounts'], ['accounting', 'account-tree']); toast.success('Account updated'); },
  });
  return { createAccount, updateAccount };
}

// ── Journal ───────────────────────────────────────────────────
export function useJournalMutations() {
  const qc = useQueryClient();
  const createEntry = useMutation({
    mutationFn: journalService.create,
    onSuccess: () => { inv(qc, ['accounting', 'journal']); toast.success('Journal entry created'); },
  });
  const reverseEntry = useMutation({
    mutationFn: (id) => journalService.reverse(id),
    onSuccess: () => { inv(qc, ['accounting', 'journal']); toast.success('Entry reversed'); },
  });
  return { createEntry, reverseEntry };
}

// ── AP ────────────────────────────────────────────────────────
export function useApMutations() {
  const qc = useQueryClient();
  const invalidate = () => inv(qc, ['accounting', 'ap-invoices'], ['accounting', 'ap-summary'], ['accounting', 'ap-aging']);

  const createApInvoice = useMutation({
    mutationFn: apService.create,
    onSuccess: () => { invalidate(); toast.success('AP invoice recorded'); },
  });
  const updateApInvoice = useMutation({
    mutationFn: ({ id, data }) => apService.update(id, data),
    onSuccess: () => { invalidate(); toast.success('AP invoice updated'); },
  });
  const approveApInvoice = useMutation({
    mutationFn: (id) => apService.approve(id),
    onSuccess: () => { invalidate(); toast.success('Invoice approved'); },
  });
  const secondApproveApInvoice = useMutation({
    mutationFn: (id) => apService.secondApprove(id),
    onSuccess: () => { invalidate(); toast.success('Second approval granted'); },
  });
  const disputeApInvoice = useMutation({
    mutationFn: ({ id, reason }) => apService.dispute(id, reason),
    onSuccess: () => { invalidate(); toast.success('Invoice disputed'); },
  });
  const createPaymentBatch = useMutation({
    mutationFn: apService.paymentBatch,
    onSuccess: () => { invalidate(); toast.success('Payment batch created'); },
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
  const invalidate = () => inv(qc, ['accounting', 'ar-receivables'], ['accounting', 'ar-summary'], ['accounting', 'ar-payments']);

  const recordPayment = useMutation({
    mutationFn: arService.recordPayment,
    onSuccess: () => { invalidate(); toast.success('Payment recorded'); },
  });
  const recordInvoicePayment = useMutation({
    mutationFn: arService.recordAndAllocateInvoicePayment,
    onSuccess: () => { invalidate(); toast.success('Payment recorded and allocated'); },
  });
  const allocatePayment = useMutation({
    mutationFn: ({ id, data }) => arService.allocatePayment(id, data),
    onSuccess: () => { invalidate(); toast.success('Payment allocated'); },
  });
  const writeOff = useMutation({
    mutationFn: ({ id, reason }) => arService.writeOff(id, reason),
    onSuccess: () => { invalidate(); toast.success('Written off'); },
  });
  const generateDunning = useMutation({
    mutationFn: arService.generateDunning,
    onSuccess: () => { inv(qc, ['accounting', 'ar-overdue']); toast.success('Dunning letters generated'); },
  });
  return { recordPayment, recordInvoicePayment, allocatePayment, writeOff, generateDunning };
}

// ── Bank ──────────────────────────────────────────────────────
export function useBankMutations() {
  const qc = useQueryClient();
  const createBankAccount = useMutation({
    mutationFn: bankService.create,
    onSuccess: () => { inv(qc, ['accounting', 'bank-accounts']); toast.success('Bank account added'); },
  });
  const updateBankAccount = useMutation({
    mutationFn: ({ id, data }) => bankService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting', 'bank-accounts']); toast.success('Bank account updated'); },
  });
  const importStatement = useMutation({
    mutationFn: bankService.importStatement,
    onSuccess: () => { inv(qc, ['accounting', 'bank-transactions']); toast.success('Statement imported'); },
  });
  const importPaymentStatus = useMutation({
    mutationFn: bankService.importPaymentStatus,
    onSuccess: () => { inv(qc, ['accounting', 'ap-invoices']); toast.success('Payment status imported'); },
  });
  const retrieveStatements = useMutation({
    mutationFn: bankService.retrieve,
    onSuccess: () => {
      inv(qc, ['accounting', 'bank-transactions'], ['accounting', 'bank-accounts'], ['accounting', 'cash-balances'], ['accounting', 'cash-forecast']);
      toast.success('Bank retrieval completed');
    },
  });
  return { createBankAccount, updateBankAccount, importStatement, importPaymentStatus, retrieveStatements };
}

// â”€â”€ Cash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useCashMutations() {
  const qc = useQueryClient();
  const updateManualBalance = useMutation({
    mutationFn: cashService.manualBalance,
    onSuccess: () => {
      inv(qc, ['accounting', 'cash-balances'], ['accounting', 'cash-forecast'], ['accounting', 'bank-accounts']);
      toast.success('Balance updated');
    },
  });
  return { updateManualBalance };
}

// â”€â”€ Reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useReconciliationMutations() {
  const qc = useQueryClient();
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
    onSuccess: () => { invalidate(); toast.success('Reconciliation completed'); },
  });
  const matchAr = useMutation({
    mutationFn: reconciliationService.matchAr,
    onSuccess: () => { invalidate(); toast.success('AR transaction matched'); },
  });
  const matchAp = useMutation({
    mutationFn: reconciliationService.matchAp,
    onSuccess: () => { invalidate(); toast.success('AP transaction matched'); },
  });
  const categorize = useMutation({
    mutationFn: reconciliationService.categorize,
    onSuccess: () => { invalidate(); toast.success('Transaction categorized'); },
  });

  return { runReconciliation, matchAr, matchAp, categorize };
}

// â”€â”€ Open Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useOpenItemMutations() {
  const qc = useQueryClient();
  const invalidate = () => inv(qc, ['accounting', 'open-items'], ['accounting', 'open-items-aging'], ['accounting', 'ar-receivables'], ['accounting', 'ap-invoices']);
  const generateStatement = useMutation({
    mutationFn: ({ entityId, params, data }) => openItemsService.statement(entityId, params, data),
    onSuccess: () => { inv(qc, ['accounting', 'documents']); toast.success('Statement generated'); },
  });
  const netItems = useMutation({
    mutationFn: openItemsService.netItems,
    onSuccess: () => { invalidate(); toast.success('Items netted'); },
  });
  return { generateStatement, netItems };
}

// â”€â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useAccDocumentMutations() {
  const qc = useQueryClient();
  const invalidate = () => inv(qc, ['accounting', 'documents']);
  const uploadDocument = useMutation({
    mutationFn: ({ file, meta }) => accDocService.upload(file, meta),
    onSuccess: () => { invalidate(); toast.success('Document uploaded'); },
  });
  const triggerOcr = useMutation({
    mutationFn: accDocService.triggerOcr,
    onSuccess: () => { invalidate(); toast.success('OCR queued'); },
  });
  const confirmOcr = useMutation({
    mutationFn: ({ id, data }) => accDocService.confirmOcr(id, data),
    onSuccess: () => { invalidate(); inv(qc, ['accounting', 'document-ocr-result']); toast.success('OCR confirmed'); },
  });
  const rejectOcr = useMutation({
    mutationFn: ({ id, data }) => accDocService.rejectOcr(id, data),
    onSuccess: () => { invalidate(); inv(qc, ['accounting', 'document-ocr-result']); toast.success('OCR rejected'); },
  });
  const assignDocument = useMutation({
    mutationFn: ({ id, data }) => accDocService.assign(id, data),
    onSuccess: () => { invalidate(); toast.success('Document assigned'); },
  });
  return { uploadDocument, triggerOcr, confirmOcr, rejectOcr, assignDocument };
}
