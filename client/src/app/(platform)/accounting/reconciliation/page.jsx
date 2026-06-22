'use client';

import { useState } from 'react';
import { Play, Search, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  useApInvoices,
  useAccounts,
  useBankAccounts,
  useReconciliationSuggestions,
  useReconciliationUnmatched,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useReconciliationMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { cursorPageLabel, formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';

function ReconciliationStatus({ transaction, de }) {
  const incoming = Number(transaction.amount || 0) > 0;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${incoming ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
      {incoming ? (de ? 'Eingang' : 'Incoming') : (de ? 'Ausgang' : 'Outgoing')}
    </span>
  );
}

export default function ReconciliationPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const [bankAccountId, setBankAccountId] = useState('ALL');
  const [cursorStack, setCursorStack] = useState([null]);
  const [selectedTx, setSelectedTx] = useState(null);
  const [categoryAccountId, setCategoryAccountId] = useState('');
  const cursor = cursorStack[cursorStack.length - 1];
  const params = {
    limit: 25,
    ...(cursor && { cursor }),
    ...(bankAccountId !== 'ALL' && { bankAccountId }),
  };
  const { data: accounts = [] } = useBankAccounts();
  const { data: postingAccounts = [] } = useAccounts({ isActive: true });
  const { data: { items = [], pagination } = {}, isLoading } = useReconciliationUnmatched(params);
  const { data: suggestions = [], isLoading: suggestionsLoading } = useReconciliationSuggestions(selectedTx?._id);
  const { data: { items: apCandidates = [] } = {} } = useApInvoices({ limit: 10, status: 'APPROVED' });
  const { runReconciliation, matchAr, matchAp, categorize } = useReconciliationMutations();

  const handleRun = () => {
    if (bankAccountId === 'ALL') return;
    runReconciliation.mutate({ bankAccountId });
  };

  const handleNext = () => {
    if (!pagination?.nextCursor) return;
    setCursorStack((current) => [...current, pagination.nextCursor]);
  };

  const handlePrev = () => {
    setCursorStack((current) => current.length > 1 ? current.slice(0, -1) : current);
  };

  const handleMatchAr = (invoiceId) => {
    if (!selectedTx?._id) return;
    matchAr.mutate({ transactionId: selectedTx._id, invoiceId });
    setSelectedTx(null);
  };

  const handleMatchAp = (apInvoiceId) => {
    if (!selectedTx?._id) return;
    matchAp.mutate({ transactionId: selectedTx._id, apInvoiceId });
    setSelectedTx(null);
  };

  const handleCategorize = () => {
    if (!selectedTx?._id || !categoryAccountId) return;
    categorize.mutate({ transactionId: selectedTx._id, accountId: categoryAccountId });
    setSelectedTx(null);
    setCategoryAccountId('');
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Bankabgleich' : 'Reconciliation'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {de ? 'Offene Banktransaktionen automatisch oder manuell zuordnen.' : 'Match open bank transactions automatically or manually.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={bankAccountId} onValueChange={(value) => { setBankAccountId(value); setCursorStack([null]); }}>
            <SelectTrigger className="h-9 w-64 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Bankkonten' : 'All bank accounts'}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account._id} value={account._id}>{account.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleRun} disabled={bankAccountId === 'ALL' || runReconciliation.isPending}>
            <Play className="h-4 w-4 mr-1.5" />
            {de ? 'Auto-Abgleich' : 'Auto Match'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Gegenpartei' : 'Counterparty'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Referenz' : 'Reference'}</th>
                <th className="px-3 py-2.5 text-center">{de ? 'Typ' : 'Type'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Betrag' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index} className="border-b border-border/50">
                    {Array.from({ length: 5 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : items.map((transaction) => (
                <tr
                  key={transaction._id}
                  className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${selectedTx?._id === transaction._id ? 'bg-muted/50' : ''}`}
                  onClick={() => setSelectedTx(transaction)}
                >
                  <td className="px-3 py-3 text-xs">{formatDate(transaction.valueDate || transaction.bookingDate)}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{transaction.payerPayeeName || transaction.description || '-'}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{transaction.bookingText}</p>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{transaction.reference || '-'}</td>
                  <td className="px-3 py-3 text-center"><ReconciliationStatus transaction={transaction} de={de} /></td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${Number(transaction.amount || 0) >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {formatMoney(transaction.amount, transaction.currency)}
                  </td>
                </tr>
              ))}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">{de ? 'Keine offenen Transaktionen.' : 'No unmatched transactions.'}</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <Button size="sm" variant="outline" onClick={handlePrev} disabled={cursorStack.length <= 1}>{de ? 'Zurueck' : 'Previous'}</Button>
            <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
            <Button size="sm" variant="outline" onClick={handleNext} disabled={!pagination?.hasNext}>{de ? 'Weiter' : 'Next'}</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{de ? 'Zuordnung' : 'Matching'}</h2>
          </div>
          {!selectedTx ? (
            <p className="text-sm text-muted-foreground">{de ? 'Transaktion auswaehlen.' : 'Select a transaction.'}</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{selectedTx.reference || selectedTx.bookingText || selectedTx._id}</p>
                <p className="text-xl font-bold tabular-nums">{formatMoney(selectedTx.amount, selectedTx.currency)}</p>
              </div>

              {Number(selectedTx.amount || 0) > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Vorschlaege' : 'Suggestions'}</h3>
                  {suggestionsLoading ? <Skeleton className="h-16 rounded-lg" /> : suggestions.slice(0, 5).map((suggestion) => (
                    <button
                      key={suggestion.invoiceId}
                      type="button"
                      onClick={() => handleMatchAr(suggestion.invoiceId)}
                      className="flex items-center justify-between rounded-lg border border-border p-3 text-left hover:border-primary/40"
                    >
                      <span>
                        <span className="block text-sm font-medium">{suggestion.invoiceNumber}</span>
                        <span className="block text-xs text-muted-foreground">{suggestion.customerName}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold">{formatMoney(suggestion.invoiceAmount)}</span>
                        <span className="block text-xs text-emerald-600">{suggestion.score}%</span>
                      </span>
                    </button>
                  ))}
                  {!suggestionsLoading && suggestions.length === 0 && (
                    <p className="text-xs text-muted-foreground">{de ? 'Keine Rechnungsvorschlaege.' : 'No invoice suggestions.'}</p>
                  )}
                </div>
              )}

              {Number(selectedTx.amount || 0) < 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Kreditoren' : 'Payables'}</h3>
                  {apCandidates
                    .filter((invoice) => Number(invoice.outstandingAmount || 0) > 0)
                    .slice()
                    .sort((a, b) => Math.abs(Number(a.outstandingAmount || 0) - Math.abs(Number(selectedTx.amount || 0))) - Math.abs(Number(b.outstandingAmount || 0) - Math.abs(Number(selectedTx.amount || 0))))
                    .slice(0, 5)
                    .map((invoice) => (
                      <button
                        key={invoice._id}
                        type="button"
                        onClick={() => handleMatchAp(invoice._id)}
                        className="flex items-center justify-between rounded-lg border border-border p-3 text-left hover:border-primary/40"
                      >
                        <span>
                          <span className="block text-sm font-medium">{invoice.apInvoiceNumber}</span>
                          <span className="block text-xs text-muted-foreground">{invoice.supplierName}</span>
                        </span>
                        <span className="text-right text-sm font-semibold">
                          {formatMoney(invoice.outstandingAmount, invoice.currency)}
                        </span>
                      </button>
                    ))}
                  {apCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground">{de ? 'Keine offenen Kreditoren gefunden.' : 'No open payables found.'}</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Kategorisieren' : 'Categorize'}</h3>
                <Select value={categoryAccountId} onValueChange={setCategoryAccountId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={de ? 'Konto auswaehlen' : 'Select account'} /></SelectTrigger>
                  <SelectContent>
                    {postingAccounts.filter((account) => !account.isGroup).map((account) => (
                      <SelectItem key={account._id} value={account._id}>
                        {account.accountNumber} {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={handleCategorize} disabled={!categoryAccountId || categorize.isPending}>
                  <Tag className="h-4 w-4 mr-1.5" />
                  {de ? 'Buchen' : 'Post Category'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
