import { useAccountingCurrency } from '../state/accounting-currency';
import { useQuery } from '@tanstack/react-query';
import {
  accountingEntityService, accountingSearchService, chartService, dashboardService, journalService, apService, arService, bankService, accDocService,
  cashService, reconciliationService, openItemsService, reportsService,
  exchangeRateService, fiscalPeriodService, taxService, fixedAssetService, budgetService, recurringTransactionService, inventoryAccountingService,
  supplierService,
} from '../services/accounting-service';

// Supplier picker for AP invoices. Always enabled so the dropdown shows
// suggestions before the user types (empty query -> default list).
export function useSupplierSearch(query = '') {
  return useQuery({
    queryKey: ['accounting', 'suppliers', 'search', query],
    queryFn: () => supplierService.search(query),
    enabled: true,
    select: (r) => (Array.isArray(r?.data) ? r.data : []),
    staleTime: 30 * 1000,
  });
}

export function useAccountingDashboard(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'dashboard', params],
    queryFn: () => dashboardService.snapshot(params),
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

// ── Chart of Accounts ─────────────────────────────────────────
export function useAccountingSearch(params = {}, options = {}) {
  const query = String(params.q || '').trim();
  const hasStructuredFilter = Boolean(
    params.type ||
    params.status ||
    params.accountId ||
    params.currency ||
    params.startDate ||
    params.endDate ||
    params.minAmount ||
    params.maxAmount,
  );

  return useQuery({
    queryKey: ['accounting', 'search', params],
    queryFn: () => accountingSearchService.search(params),
    enabled: options.enabled ?? Boolean(query || hasStructuredFilter),
    select: (r) => ({
      items: Array.isArray(r.data) ? r.data : [],
      meta: r.meta || {},
    }),
    staleTime: 15 * 1000,
  });
}

export function useExchangeRates(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'exchange-rates', params],
    queryFn: () => exchangeRateService.list(params),
    enabled: options.enabled ?? true,
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 60 * 1000,
  });
}

export function useResolvedExchangeRate(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'exchange-rate-resolve', params],
    queryFn: () => exchangeRateService.resolve(params),
    enabled: options.enabled ?? Boolean(params.baseCurrency && params.quoteCurrency),
    select: (r) => r.data,
    staleTime: 60 * 1000,
  });
}

export function useFxRevaluationPreview(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'fx-revaluation-preview', params],
    queryFn: () => exchangeRateService.revaluationPreview(params),
    enabled: options.enabled ?? true,
    select: (r) => r.data,
    staleTime: 15 * 1000,
  });
}

export function useFxRevaluationRuns(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'fx-revaluation-runs', params],
    queryFn: () => exchangeRateService.revaluationRuns(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

export function useTaxCodes(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'tax-codes', params],
    queryFn: () => taxService.codes(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 60 * 1000,
  });
}

export function useTaxSummary(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'tax-summary', params],
    queryFn: () => taxService.summary(params),
    select: (r) => r.data,
    staleTime: 60 * 1000,
  });
}

export function useVatReport(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'vat-report', params],
    queryFn: () => taxService.vatReport(params),
    select: (r) => r.data,
    staleTime: 60 * 1000,
  });
}

export function useTaxTransactions(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'tax-transactions', params],
    queryFn: () => taxService.transactions(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

export function useFixedAssets(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'fixed-assets', params],
    queryFn: () => fixedAssetService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

export function useFixedAsset(id) {
  return useQuery({
    queryKey: ['accounting', 'fixed-asset', id],
    queryFn: () => fixedAssetService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useFixedAssetSummary(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'fixed-asset-summary', params],
    queryFn: () => fixedAssetService.summary(params),
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

export function useBudgets(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'budgets', params],
    queryFn: () => budgetService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

export function useBudget(id) {
  return useQuery({
    queryKey: ['accounting', 'budget', id],
    queryFn: () => budgetService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useBudgetSummary(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'budget-summary', params],
    queryFn: () => budgetService.summary(params),
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

export function useBudgetVariance(id) {
  return useQuery({
    queryKey: ['accounting', 'budget-variance', id],
    queryFn: () => budgetService.variance(id),
    enabled: !!id,
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

export function useRecurringTransactions(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'recurring-transactions', params],
    queryFn: () => recurringTransactionService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

export function useRecurringTransactionSummary() {
  return useQuery({
    queryKey: ['accounting', 'recurring-transaction-summary'],
    queryFn: () => recurringTransactionService.summary(),
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

export function useRecurringTransactionRuns(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'recurring-transaction-runs', params],
    queryFn: () => recurringTransactionService.runs(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 15 * 1000,
  });
}

export function useInventoryValuation(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'inventory-valuation', params],
    queryFn: () => inventoryAccountingService.valuation(params),
    select: (r) => r.data,
    staleTime: 30 * 1000,
  });
}

export function useInventoryMovements(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'inventory-movements', params],
    queryFn: () => inventoryAccountingService.movements(params),
    select: (r) => r.data,
    staleTime: 15 * 1000,
  });
}

export function useInventoryAccountingEntries(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'inventory-entries', params],
    queryFn: () => inventoryAccountingService.entries(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 30 * 1000,
  });
}

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
export function useJournalEntries(params = {}, options = {}) {
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'journal', params],
    queryFn: () => journalService.list(params),
    enabled: options.enabled ?? true,
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
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
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
  const { currency } = useAccountingCurrency();
  return useQuery({
    queryKey: ['accounting', 'ap-summary', currency],
    queryFn: () => apService.summary({ currency }),
    select: (r) => r.data,
  });
}

export function useApAging() {
  const { currency } = useAccountingCurrency();
  return useQuery({
    queryKey: ['accounting', 'ap-aging', currency],
    queryFn: () => apService.aging({ currency }),
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
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'ar-receivables', params],
    queryFn: () => arService.receivables(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useArSummary() {
  const { currency } = useAccountingCurrency();
  return useQuery({
    queryKey: ['accounting', 'ar-summary', currency],
    queryFn: () => arService.summary({ currency }),
    select: (r) => r.data,
  });
}

export function useArAging() {
  const { currency } = useAccountingCurrency();
  return useQuery({
    queryKey: ['accounting', 'ar-aging', currency],
    queryFn: () => arService.aging({ currency }),
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
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
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
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'reconciliation-unmatched', params],
    queryFn: () => reconciliationService.unmatched(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useReconciliationReport(params = {}) {
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'reconciliation-report', params],
    queryFn: () => reconciliationService.report(params),
    select: (r) => r.data,
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
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'open-items', params],
    queryFn: () => openItemsService.list(params),
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination }),
  });
}

export function useOpenItemsAging(params = {}) {
  const { currency } = useAccountingCurrency();
  params = { currency, ...params };
  return useQuery({
    queryKey: ['accounting', 'open-items-aging', params],
    queryFn: () => openItemsService.aging(params),
    select: (r) => r.data,
  });
}

// â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function useProfitLoss(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'profit-loss', params],
    queryFn: () => reportsService.profitLoss(params),
    enabled: options.enabled ?? true,
    select: (r) => r.data,
  });
}

export function useBalanceSheet(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'balance-sheet', params],
    queryFn: () => reportsService.balanceSheet(params),
    enabled: options.enabled ?? true,
    select: (r) => r.data,
  });
}

export function useTrialBalance(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'trial-balance', params],
    queryFn: () => reportsService.trialBalance(params),
    enabled: options.enabled ?? true,
    select: (r) => r.data,
  });
}

export function useCashFlowReport(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'cash-flow-report', params],
    queryFn: () => reportsService.cashFlow(params),
    enabled: options.enabled ?? true,
    select: (r) => r.data,
  });
}

export function useGeneralLedger(params = {}, options = {}) {
  return useQuery({
    queryKey: ['accounting', 'general-ledger', params],
    queryFn: () => reportsService.generalLedger(params),
    enabled: options.enabled ?? true,
    select: (r) => ({ items: Array.isArray(r.data) ? r.data : [], pagination: r.pagination, meta: r.meta }),
  });
}

export function useFiscalPeriods(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'fiscal-periods', params],
    queryFn: () => fiscalPeriodService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
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

export function useAccountingEntities(params = {}) {
  return useQuery({
    queryKey: ['accounting', 'entities', params],
    queryFn: () => accountingEntityService.list(params),
    select: (r) => Array.isArray(r.data) ? r.data : [],
    staleTime: 60 * 1000,
  });
}

export function useAccountingEntity(id) {
  return useQuery({
    queryKey: ['accounting', 'entity', id],
    queryFn: () => accountingEntityService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useBankAnalytics(params) {
  return useQuery({
    queryKey: ['accounting', 'bank-analytics', params],
    queryFn: () => bankService.analytics(params),
    select: (r) => r.data,
    staleTime: 30_000,
  });
}
