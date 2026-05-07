import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chartService, journalService, apService, arService, bankService } from '../services/accounting-service';
import toast from 'react-hot-toast';

function inv(qc, ...keys) {
  keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

// ── Chart of Accounts ─────────────────────────────────────────
export function useChartMutations() {
  const qc = useQueryClient();
  const createAccount = useMutation({
    mutationFn: chartService.create,
    onSuccess: () => { inv(qc, ['accounting', 'accounts']); toast.success('Account created'); },
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, data }) => chartService.update(id, data),
    onSuccess: () => { inv(qc, ['accounting', 'accounts']); toast.success('Account updated'); },
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
  return { recordPayment, allocatePayment, writeOff, generateDunning };
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
  return { createBankAccount, updateBankAccount, importStatement };
}
