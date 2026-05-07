import { useQuery } from '@tanstack/react-query';
import { chartService, journalService, apService, arService, bankService, accDocService } from '../services/accounting-service';

// ── Chart of Accounts ─────────────────────────────────────────
export function useAccounts(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'accounts', params],
    queryFn: () => chartService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useAccountBalance(id) {
  return useQuery({
    queryKey: ['accounting', 'account-balance', id],
    queryFn: () => chartService.getBalance(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

// ── Journal ───────────────────────────────────────────────────
export function useJournalEntries(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'journal', params],
    queryFn: () => journalService.list(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useJournalEntry(id) {
  return useQuery({
    queryKey: ['accounting', 'journal', id],
    queryFn: () => journalService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

// ── AP ────────────────────────────────────────────────────────
export function useApInvoices(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'ap-invoices', params],
    queryFn: () => apService.list(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useApInvoice(id) {
  return useQuery({
    queryKey: ['accounting', 'ap-invoice', id],
    queryFn: () => apService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useApSummary() {
  return useQuery({
    queryKey: ['accounting', 'ap-summary'],
    queryFn: () => apService.summary(),
    select: (r) => r.data,
  });
}

export function useApAging() {
  return useQuery({
    queryKey: ['accounting', 'ap-aging'],
    queryFn: () => apService.aging(),
    select: (r) => r.data,
  });
}

export function useApOpenPayables() {
  return useQuery({
    queryKey: ['accounting', 'ap-open-payables'],
    queryFn: () => apService.openPayables(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

// ── AR ────────────────────────────────────────────────────────
export function useArReceivables(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'ar-receivables', params],
    queryFn: () => arService.receivables(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useArSummary() {
  return useQuery({
    queryKey: ['accounting', 'ar-summary'],
    queryFn: () => arService.summary(),
    select: (r) => r.data,
  });
}

export function useArAging() {
  return useQuery({
    queryKey: ['accounting', 'ar-aging'],
    queryFn: () => arService.aging(),
    select: (r) => r.data,
  });
}

export function useArPayments(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'ar-payments', params],
    queryFn: () => arService.payments(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useArOverdue() {
  return useQuery({
    queryKey: ['accounting', 'ar-overdue'],
    queryFn: () => arService.overdueList(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useArDunningTemplates() {
  return useQuery({
    queryKey: ['accounting', 'dunning-templates'],
    queryFn: () => arService.dunningTemplates(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

// ── Bank ──────────────────────────────────────────────────────
export function useBankAccounts(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'bank-accounts', params],
    queryFn: () => bankService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useBankTransactions(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'bank-transactions', params],
    queryFn: () => bankService.transactions(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

// ── Documents ─────────────────────────────────────────────────
export function useAccDocuments(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'documents', params],
    queryFn: () => accDocService.list(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}
