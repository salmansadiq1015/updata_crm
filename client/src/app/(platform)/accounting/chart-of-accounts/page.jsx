'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Eye, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccountOverview, useChartTree } from '@/modules/accounting/hooks/use-accounting-queries';
import { useChartMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { chartService } from '@/modules/accounting/services/accounting-service';
import { downloadResponse, formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const TYPE_CONFIG = {
  ASSET: { label: 'Aktiven', labelEn: 'Assets', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  LIABILITY: { label: 'Passiven', labelEn: 'Liabilities', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  EQUITY: { label: 'Eigenkapital', labelEn: 'Equity', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  REVENUE: { label: 'Ertrag', labelEn: 'Revenue', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  EXPENSE: { label: 'Aufwand', labelEn: 'Expense', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const VAT_RATES = [0, 2.6, 8.1];

function flattenAccountTree(nodes = []) {
  return nodes.flatMap((node) => {
    const { children = [], ...account } = node;
    return [account, ...flattenAccountTree(children)];
  });
}

function AccountFormDialog({ open, onClose, parentAccount, de }) {
  const { createAccount } = useChartMutations();
  const [form, setForm] = useState({
    accountNumber: '',
    name: '',
    type: parentAccount?.type || 'ASSET',
    isGroup: false,
    defaultVatRate: 0,
    description: '',
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    await createAccount.mutateAsync({
      ...form,
      parentId: parentAccount?._id || undefined,
      defaultVatRate: Number(form.defaultVatRate),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{de ? 'Konto erstellen' : 'Create Account'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Kontonummer' : 'Account No.'}</Label>
              <Input
                className="h-8 font-mono"
                value={form.accountNumber}
                onChange={(event) => set('accountNumber', event.target.value)}
                required
                maxLength={10}
                placeholder="1000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Typ' : 'Type'}</Label>
              <Select value={form.type} onValueChange={(value) => set('type', value)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{de ? TYPE_CONFIG[type].label : TYPE_CONFIG[type].labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Bezeichnung' : 'Name'}</Label>
            <Input
              className="h-8"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              required
              maxLength={200}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'MWST-Satz' : 'VAT Rate'}</Label>
              <Select value={String(form.defaultVatRate)} onValueChange={(value) => set('defaultVatRate', Number(value))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate} value={String(rate)}>{rate}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isGroup}
                  onChange={(event) => set('isGroup', event.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm">{de ? 'Sammelkonto' : 'Group account'}</span>
              </label>
            </div>
          </div>
          {parentAccount && (
            <p className="text-xs text-muted-foreground">
              {de ? 'Übergeordnet' : 'Parent'}: <span className="font-mono">{parentAccount.accountNumber}</span> {parentAccount.name}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createAccount.isPending}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending ? (de ? 'Erstellen...' : 'Creating...') : (de ? 'Erstellen' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountOverviewDialog({ account, open, onClose, de }) {
  const { data: overview, isLoading } = useAccountOverview(account?._id, { limit: 100 });

  const handleExport = async () => {
    if (!account?._id) return;
    const response = await chartService.exportOverview(account._id, { limit: 10000 });
    downloadResponse(response, `account-${account.accountNumber}-overview.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{account?.accountNumber} {account?.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : overview ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: de ? 'Anfangssaldo' : 'Opening', value: overview.openingBalance },
                { label: de ? 'Soll' : 'Debit', value: overview.periodDebits },
                { label: de ? 'Haben' : 'Credit', value: overview.periodCredits },
                { label: de ? 'Schlusssaldo' : 'Closing', value: overview.closingBalance },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(item.value)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{de ? 'Datum' : 'Date'}</th>
                    <th className="px-3 py-2 text-left">{de ? 'Beleg' : 'Entry'}</th>
                    <th className="px-3 py-2 text-left">{de ? 'Text' : 'Description'}</th>
                    <th className="px-3 py-2 text-right">{de ? 'Soll' : 'Debit'}</th>
                    <th className="px-3 py-2 text-right">{de ? 'Haben' : 'Credit'}</th>
                    <th className="px-3 py-2 text-right">{de ? 'Saldo' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.transactions || []).map((entry) => (
                    <tr key={entry.entryId} className="border-t border-border/50">
                      <td className="px-3 py-2 text-xs">{formatDate(entry.entryDate)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{entry.entryNumber}</td>
                      <td className="px-3 py-2 max-w-sm truncate">{entry.description || '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{entry.debit ? formatMoney(entry.debit) : '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{entry.credit ? formatMoney(entry.credit) : '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(entry.runningBalance)}</td>
                    </tr>
                  ))}
                  {(!overview.transactions || overview.transactions.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {de ? 'Keine Buchungen auf diesem Konto.' : 'No postings for this account.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{de ? 'Keine Kontoauswertung verfügbar.' : 'No account overview available.'}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleExport} disabled={!account?._id}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button onClick={onClose}>{de ? 'Schliessen' : 'Close'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountRow({ account, depth = 0, de, allAccounts, onAddChild, onOpenOverview }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = allAccounts.filter((candidate) => String(candidate.parentId) === String(account._id));
  const hasChildren = children.length > 0 || account.isGroup;
  const typeConfig = TYPE_CONFIG[account.type] || TYPE_CONFIG.ASSET;

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="h-5 w-5" />
            )}
            <span className="font-mono text-xs text-muted-foreground">{account.accountNumber}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-sm font-medium">
          {account.name}
          {!account.isActive && (
            <span className="ml-2 text-xs text-muted-foreground/50">{de ? 'inaktiv' : 'inactive'}</span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${typeConfig.badge}`}>
            {de ? typeConfig.label : typeConfig.labelEn}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground text-right">
          {account.defaultVatRate > 0 ? `${account.defaultVatRate}%` : '-'}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onOpenOverview(account)}
              className="text-xs text-muted-foreground hover:text-primary"
              title={de ? 'Kontoauszug' : 'Account overview'}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAddChild(account)}
              className="text-xs text-muted-foreground hover:text-primary"
              title={de ? 'Unterkonto hinzufügen' : 'Add sub-account'}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && children.map((child) => (
        <AccountRow
          key={child._id}
          account={child}
          depth={depth + 1}
          de={de}
          allAccounts={allAccounts}
          onAddChild={onAddChild}
          onOpenOverview={onOpenOverview}
        />
      ))}
    </>
  );
}

export default function ChartOfAccountsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [parentAccount, setParentAccount] = useState(null);
  const [overviewAccount, setOverviewAccount] = useState(null);

  const { data: accountTree = [], isLoading } = useChartTree();
  const accounts = useMemo(() => flattenAccountTree(accountTree), [accountTree]);

  const roots = accounts.filter((account) => !account.parentId);
  const filtered = search
    ? accounts.filter((account) =>
        account.name.toLowerCase().includes(search.toLowerCase()) ||
        account.accountNumber.includes(search)
      )
    : null;

  const handleAddChild = (parent) => {
    setParentAccount(parent);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Kontenplan' : 'Chart of Accounts'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {de ? 'Doppelte Buchhaltung - Schweizer KMU Kontenplan' : 'Double-entry - Swiss SME chart of accounts'}
          </p>
        </div>
        <Button onClick={() => { setParentAccount(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          {de ? 'Konto' : 'Account'}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9"
          placeholder={de ? 'Konto suchen...' : 'Search accounts...'}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left w-32">{de ? 'Nummer' : 'Number'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Bezeichnung' : 'Name'}</th>
              <th className="px-3 py-2.5 text-left w-36">{de ? 'Typ' : 'Type'}</th>
              <th className="px-3 py-2.5 text-right w-24">MWST</th>
              <th className="px-3 py-2.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-48" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5"><Skeleton className="h-4 w-10 ml-auto" /></td>
                  <td />
                </tr>
              ))
            ) : filtered ? (
              filtered.map((account) => (
                <AccountRow
                  key={account._id}
                  account={account}
                  depth={0}
                  de={de}
                  allAccounts={accounts}
                  onAddChild={handleAddChild}
                  onOpenOverview={setOverviewAccount}
                />
              ))
            ) : (
              roots.map((account) => (
                <AccountRow
                  key={account._id}
                  account={account}
                  depth={0}
                  de={de}
                  allAccounts={accounts}
                  onAddChild={handleAddChild}
                  onOpenOverview={setOverviewAccount}
                />
              ))
            )}
            {!isLoading && accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {de ? 'Noch keine Konten vorhanden.' : 'No accounts yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AccountFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        parentAccount={parentAccount}
        de={de}
      />
      <AccountOverviewDialog
        account={overviewAccount}
        open={!!overviewAccount}
        onClose={() => setOverviewAccount(null)}
        de={de}
      />
    </div>
  );
}
