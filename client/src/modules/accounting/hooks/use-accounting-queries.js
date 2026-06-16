import { useQuery } from '@tanstack/react-query';
import {
  chartService, journalService, apService, arService, bankService, accDocService,
  cashService, reconciliationService, openItemsService, reportsService,
} from '../services/accounting-service';

// ── Chart of Accounts ─────────────────────────────────────────
export function useAccounts(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'accounts', params],
    queryFn: () => chartService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useChartTree() {
  return useQuery({
    queryKey: ['accounting', 'account-tree'],
    queryFn: () => chartService.tree(),
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

export function useAccountOverview(id, params = {}) {
  return useQuery({
    queryKey: ['accounting', 'account-overview', id, params],
    queryFn: () => chartService.getOverview(id, params),
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

// â”€â”€ Cash â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useCashBalances() {
  return useQuery({
    queryKey: ['accounting', 'cash-balances'],
    queryFn: () => cashService.balances(),
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });
}

export function useCashForecast(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'cash-forecast', params],
    queryFn: () => cashService.forecast(params),
    select: (r) => r.data,
  });
}

// â”€â”€ Reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useReconciliationUnmatched(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'reconciliation-unmatched', params],
    queryFn: () => reconciliationService.unmatched(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useReconciliationSuggestions(txId) {
  return useQuery({
    queryKey: ['accounting', 'reconciliation-suggestions', txId],
    queryFn: () => reconciliationService.suggestions(txId),
    enabled: !!txId,
    select: (r) => r.data,
  });
}

// â”€â”€ Open Items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useOpenItems(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'open-items', params],
    queryFn: () => openItemsService.list(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useOpenItemsAging(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'open-items-aging', params],
    queryFn: () => openItemsService.aging(params),
    select: (r) => r.data,
  });
}

// â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useProfitLoss(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'profit-loss', params],
    queryFn: () => reportsService.profitLoss(params),
    select: (r) => r.data,
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

export function useAccDocument(id) {
  return useQuery({
    queryKey: ['accounting', 'document', id],
    queryFn: () => accDocService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useAccDocumentOcrResult(id) {
  return useQuery({
    queryKey: ['accounting', 'document-ocr-result', id],
    queryFn: () => accDocService.getOcrResult(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}
