'use client';

import { useMemo, useState } from 'react';
import { Plus, RotateCcw, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccountingEntities, useJournalEntries, useAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { useJournalMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { journalService } from '@/modules/accounting/services/accounting-service';
import { cursorPageLabel, downloadResponse } from '@/modules/accounting/utils/accounting-ui';

const fmt = (n) =>
  new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

const REF_TYPE_CONFIG = {
  AR_INVOICE:  { label: 'AR Rechnung',   labelEn: 'AR Invoice',   color: 'text-sky-600' },
  AR_PAYMENT:  { label: 'AR Zahlung',    labelEn: 'AR Payment',   color: 'text-emerald-600' },
  AP_INVOICE:  { label: 'AP Rechnung',   labelEn: 'AP Invoice',   color: 'text-orange-600' },
  AP_PAYMENT:  { label: 'AP Zahlung',    labelEn: 'AP Payment',   color: 'text-orange-500' },
  MANUAL:      { label: 'Manuell',       labelEn: 'Manual',       color: 'text-muted-foreground' },
  REVERSAL:    { label: 'Storno',        labelEn: 'Reversal',     color: 'text-red-500' },
  WRITE_OFF:   { label: 'Abschreibung',  labelEn: 'Write-Off',    color: 'text-slate-500' },
  BANK_FEE:    { label: 'Bankgebühr',    labelEn: 'Bank Fee',     color: 'text-slate-400' },
  INVOICE_FINALIZED: { label: 'Rechnung finalisiert', labelEn: 'Invoice Finalized', color: 'text-sky-500' },
  INVOICE_PAYMENT: { label: 'Rechnungszahlung', labelEn: 'Invoice Payment', color: 'text-emerald-500' },
  AUTO_RECONCILIATION: { label: 'Auto-Abgleich', labelEn: 'Auto Reconciliation', color: 'text-indigo-500' },
  MANUAL_RECONCILIATION: { label: 'Manueller Abgleich', labelEn: 'Manual Reconciliation', color: 'text-indigo-600' },
  CATEGORIZATION: { label: 'Kategorisierung', labelEn: 'Categorization', color: 'text-violet-500' },
  NETTING: { label: 'Verrechnung', labelEn: 'Netting', color: 'text-teal-600' },
};

function currentYearRange() {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

function entityLabel(entity) {
  if (!entity || typeof entity !== 'object') return '-';
  return [entity.entityCode, entity.name].filter(Boolean).join(' ');
}

function parentId(entity) {
  if (!entity?.parentId) return null;
  return typeof entity.parentId === 'object' ? entity.parentId._id : entity.parentId;
}

function JournalFormDialog({
  open, onClose, de, accounts, companies, branches,
}) {
  const { createEntry } = useJournalMutations();
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    description: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
    currency: 'CHF',
    companyId: 'ALL',
    branchId: 'ALL',
  });
  const set = (k, v) => setForm((f) => ({
    ...f,
    [k]: v,
    ...(k === 'companyId' ? { branchId: 'ALL' } : {}),
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: Number(form.amount),
      referenceType: 'MANUAL',
    };
    if (payload.companyId === 'ALL') delete payload.companyId;
    if (payload.branchId === 'ALL') delete payload.branchId;
    await createEntry.mutateAsync(payload);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{de ? 'Buchungssatz erfassen' : 'New Journal Entry'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Buchungsdatum' : 'Entry Date'}</Label>
              <Input type="date" className="h-8" value={form.entryDate} onChange={(e) => set('entryDate', e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Währung' : 'Currency'}</Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Beschreibung' : 'Description'}</Label>
            <Input className="h-8" value={form.description} onChange={(e) => set('description', e.target.value)} required maxLength={500} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Firma' : 'Company'}</Label>
              <Select value={form.companyId} onValueChange={(v) => set('companyId', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{de ? 'Keine Zuordnung' : 'Unscoped'}</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company._id} value={company._id}>{entityLabel(company)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Filiale' : 'Branch'}</Label>
              <Select value={form.branchId} onValueChange={(v) => set('branchId', v)} disabled={branches.length === 0}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{de ? 'Keine Zuordnung' : 'Unscoped'}</SelectItem>
                  {branches
                    .filter((branch) => form.companyId === 'ALL' || String(parentId(branch)) === String(form.companyId))
                    .map((branch) => (
                      <SelectItem key={branch._id} value={branch._id}>{entityLabel(branch)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Soll-Konto' : 'Debit Account'}</Label>
              <Select value={form.debitAccountId} onValueChange={(v) => set('debitAccountId', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={de ? 'Konto wählen' : 'Select account'} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      <span className="font-mono text-xs mr-2">{a.accountNumber}</span>{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Haben-Konto' : 'Credit Account'}</Label>
              <Select value={form.creditAccountId} onValueChange={(v) => set('creditAccountId', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={de ? 'Konto wählen' : 'Select account'} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      <span className="font-mono text-xs mr-2">{a.accountNumber}</span>{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Betrag' : 'Amount'}</Label>
            <Input type="number" step="0.05" min="0.05" className="h-8 font-mono" value={form.amount} onChange={(e) => set('amount', e.target.value)} required placeholder="0.00" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createEntry.isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={createEntry.isPending || !form.debitAccountId || !form.creditAccountId}>
              {createEntry.isPending ? '...' : (de ? 'Buchen' : 'Post')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function JournalPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const [dateRange, setDateRange] = useState(() => currentYearRange());
  const [refType, setRefType] = useState('ALL');
  const [accountId, setAccountId] = useState('ALL');
  const [scopeFilters, setScopeFilters] = useState({ companyId: 'ALL', branchId: 'ALL' });
  const [cursorStack, setCursorStack] = useState([null]);
  const [isExporting, setIsExporting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const cursor = cursorStack[cursorStack.length - 1];
  const hasDateRangeError = Boolean(dateRange.startDate && dateRange.endDate && dateRange.startDate > dateRange.endDate);
  const { data: accountingEntities = [] } = useAccountingEntities({ status: 'ACTIVE' });
  const companies = useMemo(() => accountingEntities.filter((entity) => entity.type === 'COMPANY'), [accountingEntities]);
  const branches = useMemo(() => accountingEntities.filter((entity) => entity.type === 'BRANCH'), [accountingEntities]);
  const scopedBranches = useMemo(() => branches.filter((branch) => (
    scopeFilters.companyId === 'ALL' || String(parentId(branch)) === String(scopeFilters.companyId)
  )), [branches, scopeFilters.companyId]);

  const filters = {
    limit: 50,
    entryDateFrom: dateRange.startDate,
    entryDateTo: dateRange.endDate,
    ...(refType !== 'ALL' && { referenceType: refType }),
    ...(accountId !== 'ALL' && { accountId }),
    ...(scopeFilters.companyId !== 'ALL' && { companyId: scopeFilters.companyId }),
    ...(scopeFilters.branchId !== 'ALL' && { branchId: scopeFilters.branchId }),
    ...(cursor && { cursor }),
  };

  const { data: { items = [], pagination } = {}, isLoading, isError, error } = useJournalEntries(filters, {
    enabled: !hasDateRangeError,
  });
  const { data: accounts = [] } = useAccounts({ limit: 500 });
  const { reverseEntry } = useJournalMutations();

  const resetList = () => setCursorStack([null]);

  const updateDateRange = (key, value) => {
    setDateRange((current) => ({ ...current, [key]: value }));
    resetList();
  };
  const updateScopeFilter = (key, value) => {
    setScopeFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'companyId' ? { branchId: 'ALL' } : {}),
    }));
    resetList();
  };

  const handleExport = async () => {
    if (hasDateRangeError || !dateRange.startDate || !dateRange.endDate) {
      toast.error(de ? 'Bitte einen gueltigen Zeitraum waehlen.' : 'Select a valid date range.');
      return;
    }
    setIsExporting(true);
    try {
      const response = await journalService.export({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        ...(scopeFilters.companyId !== 'ALL' && { companyId: scopeFilters.companyId }),
        ...(scopeFilters.branchId !== 'ALL' && { branchId: scopeFilters.branchId }),
      });
      downloadResponse(response, `journal-${dateRange.startDate}-${dateRange.endDate}.csv`);
    } catch (err) {
      toast.error(err?.message || (de ? 'Journal-Export fehlgeschlagen.' : 'Journal export failed.'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Journal' : 'Journal Entries'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {de ? 'Alle Buchungssätze der doppelten Buchhaltung' : 'All double-entry journal transactions'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || hasDateRangeError}>
            <Download className="h-4 w-4 mr-1.5" />
            {isExporting ? (de ? 'Export...' : 'Exporting...') : 'CSV'}
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {de ? 'Buchung' : 'Entry'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          type="date"
          className="h-9 w-40"
          value={dateRange.startDate}
          onChange={(event) => updateDateRange('startDate', event.target.value)}
        />
        <Input
          type="date"
          className="h-9 w-40"
          value={dateRange.endDate}
          onChange={(event) => updateDateRange('endDate', event.target.value)}
        />
        <Select value={accountId} onValueChange={(value) => { setAccountId(value); resetList(); }}>
          <SelectTrigger className="h-9 w-72 text-xs"><SelectValue placeholder={de ? 'Konto' : 'Account'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Konten' : 'All Accounts'}</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account._id} value={account._id}>{account.accountNumber} {account.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={refType} onValueChange={(value) => { setRefType(value); resetList(); }}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Typen' : 'All Types'}</SelectItem>
            {Object.keys(REF_TYPE_CONFIG).map((k) => (
              <SelectItem key={k} value={k}>{de ? REF_TYPE_CONFIG[k].label : REF_TYPE_CONFIG[k].labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scopeFilters.companyId} onValueChange={(value) => updateScopeFilter('companyId', value)}>
          <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder={de ? 'Firma' : 'Company'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Firmen' : 'All Companies'}</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company._id} value={company._id}>{entityLabel(company)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scopeFilters.branchId} onValueChange={(value) => updateScopeFilter('branchId', value)} disabled={scopedBranches.length === 0}>
          <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder={de ? 'Filiale' : 'Branch'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Filialen' : 'All Branches'}</SelectItem>
            {scopedBranches.map((branch) => (
              <SelectItem key={branch._id} value={branch._id}>{entityLabel(branch)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasDateRangeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {de ? 'Startdatum muss vor dem Enddatum liegen.' : 'Start date must be before end date.'}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error?.message || (de ? 'Journal konnte nicht geladen werden.' : 'Could not load journal entries.')}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left w-16">Nr.</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Beschreibung' : 'Description'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Soll' : 'Debit'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Haben' : 'Credit'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Typ' : 'Type'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Betrag' : 'Amount'}</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.map((entry) => {
              const rCfg = REF_TYPE_CONFIG[entry.referenceType] || REF_TYPE_CONFIG.MANUAL;
              const isReversal = entry.referenceType === 'REVERSAL' || !!entry.reversalOf;
              return (
                <tr key={entry._id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${isReversal ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{entry.entryNumber}</td>
                  <td className="px-3 py-2.5 text-xs">{fmtDate(entry.entryDate)}</td>
                  <td className="px-3 py-2.5 max-w-52 truncate" title={entry.description}>{entry.description}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {entry.debitAccountId?.accountNumber ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {entry.creditAccountId?.accountNumber ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${rCfg.color}`}>
                      {de ? rCfg.label : rCfg.labelEn}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium tabular-nums">
                    {fmt(entry.amount)} <span className="text-muted-foreground text-xs">{entry.currency}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {entry.referenceType === 'MANUAL' && !entry.reversalOf && (
                      <button
                        type="button"
                        title={de ? 'Stornieren' : 'Reverse'}
                        onClick={() => reverseEntry.mutate(entry._id)}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {de ? 'Keine Buchungssätze.' : 'No journal entries.'}
              </td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursorStack((current) => (current.length > 1 ? current.slice(0, -1) : current))}
            disabled={cursorStack.length <= 1 || isLoading}
          >
            {de ? 'Zurueck' : 'Previous'}
          </Button>
          <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pagination?.nextCursor && setCursorStack((current) => [...current, pagination.nextCursor])}
            disabled={!pagination?.hasNext || isLoading}
          >
            {de ? 'Weiter' : 'Next'}
          </Button>
        </div>
      </div>

      <JournalFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        de={de}
        accounts={accounts}
        companies={companies}
        branches={branches}
      />
    </div>
  );
}
