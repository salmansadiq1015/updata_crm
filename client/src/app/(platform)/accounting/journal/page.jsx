'use client';

import { useState } from 'react';
import { Plus, RotateCcw, Search, Download } from 'lucide-react';
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
import { useJournalEntries, useAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { useJournalMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { journalService } from '@/modules/accounting/services/accounting-service';

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
};

function JournalFormDialog({ open, onClose, de, accounts }) {
  const { createEntry } = useJournalMutations();
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    description: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
    currency: 'CHF',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createEntry.mutateAsync({
      ...form,
      amount: Number(form.amount),
      referenceType: 'MANUAL',
    });
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
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [search, setSearch] = useState('');
  const [refType, setRefType] = useState('ALL');
  const [formOpen, setFormOpen] = useState(false);

  const filters = {
    ...(refType !== 'ALL' && { referenceType: refType }),
    ...(search && { q: search }),
  };

  const { data: { items = [] } = {}, isLoading } = useJournalEntries(filters);
  const { data: accounts = [] } = useAccounts();
  const { reverseEntry } = useJournalMutations();

  const handleExport = async () => {
    try {
      const res = await journalService.export(filters);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* handled by toast */ }
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
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            {de ? 'Export CSV' : 'Export CSV'}
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            {de ? 'Buchung' : 'Entry'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder={de ? 'Suchen...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={refType} onValueChange={setRefType}>
          <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Typen' : 'All Types'}</SelectItem>
            {Object.keys(REF_TYPE_CONFIG).map((k) => (
              <SelectItem key={k} value={k}>{de ? REF_TYPE_CONFIG[k].label : REF_TYPE_CONFIG[k].labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
      </div>

      <JournalFormDialog open={formOpen} onClose={() => setFormOpen(false)} de={de} accounts={accounts} />
    </div>
  );
}
