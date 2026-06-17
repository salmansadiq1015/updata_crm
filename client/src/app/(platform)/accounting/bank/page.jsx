'use client';

import { useState, useRef } from 'react';
import { Plus, Upload, ArrowUp, ArrowDown, Search, FileCheck2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useBankAccounts, useBankTransactions } from '@/modules/accounting/hooks/use-accounting-queries';
import { useBankMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { cursorPageLabel } from '@/modules/accounting/utils/accounting-ui';

const fmt = (n, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n ?? 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

function BankAccountForm({ open, onClose, de }) {
  const { createBankAccount } = useBankMutations();
  const [form, setForm] = useState({ bankName: '', iban: '', currency: 'CHF' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createBankAccount.mutateAsync({
      name: form.bankName,
      bankName: form.bankName,
      iban: form.iban,
      currency: form.currency,
      connectionType: 'MANUAL',
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{de ? 'Bankkonto hinzufügen' : 'Add Bank Account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Bank' : 'Bank Name'}</Label>
            <Input className="h-8" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} required placeholder="PostFinance / UBS / ZKB..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">IBAN</Label>
            <Input className="h-8 font-mono tracking-wider" value={form.iban} onChange={(e) => set('iban', e.target.value.toUpperCase())} required placeholder="CH56 0483 5012 3456 7800 9" maxLength={30} />
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createBankAccount.isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={createBankAccount.isPending}>
              {createBankAccount.isPending ? '...' : (de ? 'Hinzufügen' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, de, accounts }) {
  const { importStatement } = useBankMutations();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [bankAccountId, setBankAccountId] = useState('');
  const [format, setFormat] = useState('camt053');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !bankAccountId) return;
    await importStatement.mutateAsync({ file, bankAccountId, format });
    onClose();
    setFile(null);
    setBankAccountId('');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{de ? 'Kontoauszug importieren' : 'Import Bank Statement'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <p className="text-xs text-muted-foreground">
            {de ? 'Unterstützte Formate: camt.053 und camt.054 XML' : 'Supported formats: camt.053 and camt.054 XML'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Bankkonto' : 'Bank account'}</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={de ? 'Auswählen' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account._id} value={account._id}>{account.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="camt053">camt.053</SelectItem>
                  <SelectItem value="camt054">camt.054</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{de ? 'Datei auswählen oder hierher ziehen' : 'Select file or drag here'}</p>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={!file || !bankAccountId || importStatement.isPending}>
              {importStatement.isPending ? (de ? 'Importiere...' : 'Importing...') : (de ? 'Importieren' : 'Import')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentStatusDialog({ open, onClose, de }) {
  const { importPaymentStatus } = useBankMutations();
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    await importPaymentStatus.mutateAsync(file);
    setFile(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{de ? 'Zahlungsstatus importieren' : 'Import Payment Status'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <p className="text-xs text-muted-foreground">
            {de ? 'pain.002 XML Statusbericht einer Zahlungsdatei.' : 'pain.002 XML status report for an exported payment file.'}
          </p>
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileCheck2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{de ? 'pain.002 XML auswaehlen' : 'Select pain.002 XML'}</p>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".xml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={!file || importPaymentStatus.isPending}>
              {importPaymentStatus.isPending ? (de ? 'Importiere...' : 'Importing...') : (de ? 'Importieren' : 'Import')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountsTab({ de, onImport, onImportStatus }) {
  const { data: accounts = [], isLoading } = useBankAccounts();
  const { retrieveStatements } = useBankMutations();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onImportStatus}>
          <FileCheck2 className="h-4 w-4 mr-1.5" />
          pain.002
        </Button>
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="h-4 w-4 mr-1.5" />
          {de ? 'Kontoauszug' : 'Import Statement'}
        </Button>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {de ? 'Konto' : 'Account'}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
          : accounts.map((acc) => {
            const canRetrieve = ['EBICS', 'SFTP'].includes(acc.connectionType) && acc.status !== 'INACTIVE';
            return (
            <div key={acc._id} className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{acc.bankName}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{acc.iban}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${acc.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {acc.isActive ? (de ? 'Aktiv' : 'Active') : (de ? 'Inaktiv' : 'Inactive')}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">{acc.connectionType || 'MANUAL'}</span>
                </div>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{fmt(acc.currentBalance, acc.currency)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{de ? 'Aktueller Saldo' : 'Current balance'}</p>
              </div>
              {acc.lastImportedAt && (
                <p className="text-xs text-muted-foreground">
                  {de ? 'Zuletzt importiert' : 'Last imported'}: {fmtDate(acc.lastImportedAt)}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="mt-auto"
                onClick={() => retrieveStatements.mutate({ bankAccountId: acc._id })}
                disabled={!canRetrieve || retrieveStatements.isPending}
                title={canRetrieve ? undefined : (de ? 'Nur EBICS/SFTP Verbindungen' : 'EBICS/SFTP connections only')}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                {de ? 'Synchronisieren' : 'Sync'}
              </Button>
            </div>
            );
          })}
        {!isLoading && accounts.length === 0 && (
          <div className="col-span-3 text-center py-12 text-sm text-muted-foreground">
            {de ? 'Noch kein Bankkonto.' : 'No bank accounts yet.'}
          </div>
        )}
      </div>

      <BankAccountForm open={formOpen} onClose={() => setFormOpen(false)} de={de} />
    </div>
  );
}

function TransactionsTab({ de, t }) {
  const [search, setSearch] = useState('');
  const [bankAccountId, setBankAccountId] = useState('ALL');
  const [reconciliationStatus, setReconciliationStatus] = useState('ALL');
  const [cursorStack, setCursorStack] = useState([null]);
  const cursor = cursorStack[cursorStack.length - 1];
  const { data: accounts = [] } = useBankAccounts();
  const filters = {
    limit: 50,
    ...(search && { q: search }),
    ...(bankAccountId !== 'ALL' && { bankAccountId }),
    ...(reconciliationStatus !== 'ALL' && { reconciliationStatus }),
    ...(cursor && { cursor }),
  };
  const { data: { items = [], pagination } = {}, isLoading } = useBankTransactions(filters);

  const resetList = () => setCursorStack([null]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder={de ? 'Suchen...' : 'Search...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetList(); }}
          />
        </div>
        <Select value={bankAccountId} onValueChange={(value) => { setBankAccountId(value); resetList(); }}>
          <SelectTrigger className="h-9 w-56 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Konten' : 'All accounts'}</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account._id} value={account._id}>{account.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reconciliationStatus} onValueChange={(value) => { setReconciliationStatus(value); resetList(); }}>
          <SelectTrigger className="h-9 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Status' : 'All statuses'}</SelectItem>
            <SelectItem value="UNMATCHED">{de ? 'Unabgestimmt' : 'Unmatched'}</SelectItem>
            <SelectItem value="AUTO_MATCHED">{de ? 'Automatisch' : 'Auto matched'}</SelectItem>
            <SelectItem value="MANUALLY_MATCHED">{de ? 'Manuell' : 'Manual'}</SelectItem>
            <SelectItem value="CATEGORIZED">{de ? 'Kategorisiert' : 'Categorized'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Verwendungszweck' : 'Description'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Referenz' : 'Reference'}</th>
              <th className="px-3 py-2.5 text-center">{de ? 'Typ' : 'Type'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Betrag' : 'Amount'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Saldo' : 'Balance'}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.map((tx) => {
              const isCredit = (tx.amount ?? 0) > 0;
              return (
                <tr key={tx._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3 text-xs">{fmtDate(tx.valueDate || tx.bookingDate)}</td>
                  <td className="px-3 py-3 max-w-64 truncate" title={tx.description}>{tx.description}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{tx.reference || '—'}</td>
                  <td className="px-3 py-3 text-center">
                    {isCredit
                      ? <ArrowDown className="h-4 w-4 text-emerald-500 mx-auto" />
                      : <ArrowUp className="h-4 w-4 text-red-500 mx-auto" />}
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums font-medium ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isCredit ? '+' : ''}{fmt(tx.amount, tx.currency)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {tx.runningBalance != null ? fmt(tx.runningBalance, tx.currency) : '—'}
                  </td>
                </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {de ? 'Keine Transaktionen.' : 'No transactions found.'}
              </td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursorStack((current) => (current.length > 1 ? current.slice(0, -1) : current))}
            disabled={cursorStack.length <= 1}
          >
            {de ? 'Zurueck' : 'Previous'}
          </Button>
          <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pagination?.nextCursor && setCursorStack((current) => [...current, pagination.nextCursor])}
            disabled={!pagination?.hasNext}
          >
            {de ? 'Weiter' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function BankPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const [importOpen, setImportOpen] = useState(false);
  const [statusImportOpen, setStatusImportOpen] = useState(false);
  const { data: bankAccounts = [] } = useBankAccounts();

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Bank' : 'Bank Accounts'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de ? 'Bankkonten und Kontoauszüge verwalten' : 'Manage bank accounts and statements'}
        </p>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="h-9">
          <TabsTrigger value="accounts" className="text-xs">{de ? 'Konten' : 'Accounts'}</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs">{de ? 'Transaktionen' : 'Transactions'}</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" className="mt-4">
          <AccountsTab de={de} onImport={() => setImportOpen(true)} onImportStatus={() => setStatusImportOpen(true)} />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab de={de} t={t} />
        </TabsContent>
      </Tabs>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} de={de} accounts={bankAccounts} />
      <PaymentStatusDialog open={statusImportOpen} onClose={() => setStatusImportOpen(false)} de={de} />
    </div>
  );
}
