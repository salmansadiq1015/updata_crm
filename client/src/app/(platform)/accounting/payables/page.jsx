'use client';

import { useState } from 'react';
import { CreditCard, Download, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccounts, useApInvoices, useApSummary, useBankAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { useApMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { apService } from '@/modules/accounting/services/accounting-service';
import { cursorPageLabel, downloadResponse } from '@/modules/accounting/utils/accounting-ui';
import {
  buildApInvoicePayload,
  calculateApInvoicePreview,
  calculateApLineTotal,
  emptyApLine,
} from '@/modules/accounting/utils/ap-invoice-payload';

const fmt = (n, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

const STATUS_CONFIG = {
  RECORDED:         { label: 'Erfasst',         labelEn: 'Recorded',          badge: 'bg-slate-100 text-muted-foreground dark:bg-slate-900/30 dark:text-muted-foreground' },
  APPROVED:         { label: 'Genehmigt',        labelEn: 'Approved',          badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  PAID:             { label: 'Bezahlt',          labelEn: 'Paid',              badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  PARTIALLY_PAID:   { label: 'Teilbezahlt',      labelEn: 'Partially Paid',    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  DISPUTED:         { label: 'Strittig',         labelEn: 'Disputed',          badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  CANCELLED:        { label: 'Storniert',        labelEn: 'Cancelled',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function StatusBadge({ status, de }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.RECORDED;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{de ? cfg.label : cfg.labelEn}</span>;
}

function isBatchEligible(invoice) {
  return invoice.status === 'APPROVED' && Number(invoice.outstandingAmount || 0) > 0 && !invoice.paymentBatchId;
}

function CreateApInvoiceDialog({ open, onClose, accounts, de }) {
  const { createApInvoice } = useApMutations();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    supplierId: '',
    supplierName: '',
    supplierIban: '',
    supplierBic: '',
    supplierInvoiceNumber: '',
    invoiceDate: today,
    dueDate: today,
    paymentTermsDays: '30',
    currency: 'CHF',
    projectReference: '',
    orderReference: '',
  });
  const [lines, setLines] = useState([emptyApLine()]);

  const postingAccounts = accounts.filter((account) => !account.isGroup && account.isActive !== false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index, key, value) => setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  const preview = calculateApInvoicePreview(lines);
  const canSubmit = form.supplierId.trim()
    && form.supplierName.trim()
    && form.supplierInvoiceNumber.trim()
    && lines.every((line) => line.description.trim() && Number(line.quantity) > 0 && Number(line.unitPrice) >= 0 && line.accountId);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await createApInvoice.mutateAsync(buildApInvoicePayload(form, lines));
    setLines([emptyApLine()]);
    setForm((current) => ({
      ...current,
      supplierId: '',
      supplierName: '',
      supplierIban: '',
      supplierBic: '',
      supplierInvoiceNumber: '',
      projectReference: '',
      orderReference: '',
    }));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Lieferantenrechnung erfassen' : 'Record Supplier Invoice'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Supplier ID' : 'Supplier ID'}</Label>
              <Input className="h-9 font-mono text-xs" value={form.supplierId} onChange={(event) => set('supplierId', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Lieferant' : 'Supplier'}</Label>
              <Input className="h-9" value={form.supplierName} onChange={(event) => set('supplierName', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Rechnungsnr.' : 'Invoice No.'}</Label>
              <Input className="h-9 font-mono text-xs" value={form.supplierInvoiceNumber} onChange={(event) => set('supplierInvoiceNumber', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Waehrung' : 'Currency'}</Label>
              <Select value={form.currency} onValueChange={(value) => set('currency', value)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHF">CHF</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Rechnungsdatum' : 'Invoice Date'}</Label>
              <Input type="date" className="h-9" value={form.invoiceDate} onChange={(event) => set('invoiceDate', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Faellig' : 'Due Date'}</Label>
              <Input type="date" className="h-9" value={form.dueDate} onChange={(event) => set('dueDate', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Projekt' : 'Project'}</Label>
              <Input className="h-9" value={form.projectReference} onChange={(event) => set('projectReference', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Auftrag' : 'Order'}</Label>
              <Input className="h-9" value={form.orderReference} onChange={(event) => set('orderReference', event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">IBAN</Label>
              <Input className="h-9 font-mono text-xs" value={form.supplierIban} onChange={(event) => set('supplierIban', event.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">BIC</Label>
              <Input className="h-9 font-mono text-xs" value={form.supplierBic} onChange={(event) => set('supplierBic', event.target.value.toUpperCase())} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Zahlungsziel Tage' : 'Payment Terms Days'}</Label>
              <Input type="number" min="0" className="h-9" value={form.paymentTermsDays} onChange={(event) => set('paymentTermsDays', event.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">{de ? 'Positionen' : 'Line Items'}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((current) => [...current, emptyApLine()])} disabled={lines.length >= 20}>
                <Plus className="h-4 w-4 mr-1.5" />
                {de ? 'Position' : 'Line'}
              </Button>
            </div>
            <div className="divide-y divide-border">
              {lines.map((line, index) => {
                const lineTotal = calculateApLineTotal(line);
                return (
                  <div key={index} className="grid gap-2 p-3 md:grid-cols-[1.5fr_0.5fr_0.5fr_0.7fr_0.6fr_1fr_2rem]">
                    <Input className="h-9" value={line.description} onChange={(event) => setLine(index, 'description', event.target.value)} placeholder={de ? 'Beschreibung' : 'Description'} required />
                    <Input type="number" min="0" step="0.001" className="h-9" value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} required />
                    <Input className="h-9" value={line.unit} onChange={(event) => setLine(index, 'unit', event.target.value)} />
                    <Input type="number" min="0" step="0.01" className="h-9" value={line.unitPrice} onChange={(event) => setLine(index, 'unitPrice', event.target.value)} required />
                    <Select value={line.vatRate} onValueChange={(value) => setLine(index, 'vatRate', value)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8.1">8.1%</SelectItem>
                        <SelectItem value="2.6">2.6%</SelectItem>
                        <SelectItem value="0">0%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={line.accountId} onValueChange={(value) => setLine(index, 'accountId', value)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={de ? 'Konto' : 'Account'} /></SelectTrigger>
                      <SelectContent>
                        {postingAccounts.map((account) => (
                          <SelectItem key={account._id} value={account._id}>{account.accountNumber} {account.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} disabled={lines.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <p className="md:col-span-7 text-right text-xs text-muted-foreground">
                      {de ? 'Zeilensumme' : 'Line total'}: {fmt(lineTotal, form.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-6 text-sm">
            <span>{de ? 'Netto' : 'Net'}: <strong>{fmt(preview.subtotal, form.currency)}</strong></span>
            <span>MWST: <strong>{fmt(preview.vatTotal, form.currency)}</strong></span>
            <span>Total: <strong>{fmt(preview.total, form.currency)}</strong></span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createApInvoice.isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={createApInvoice.isPending || !canSubmit}>
              {createApInvoice.isPending ? '...' : (de ? 'Speichern' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ invoice, open, onClose, de }) {
  const { approveApInvoice, secondApproveApInvoice, disputeApInvoice } = useApMutations();
  const [reason, setReason] = useState('');
  const [action, setAction] = useState('approve');

  const handleConfirm = async () => {
    if (action === 'approve') await approveApInvoice.mutateAsync(invoice._id);
    else if (action === 'second-approve') await secondApproveApInvoice.mutateAsync(invoice._id);
    else await disputeApInvoice.mutateAsync({ id: invoice._id, reason });
    onClose();
  };

  const isPending = approveApInvoice.isPending || secondApproveApInvoice.isPending || disputeApInvoice.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{invoice?.apInvoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex gap-2">
            {['approve', 'second-approve', 'dispute'].map((a) => (
              <Button
                key={a}
                type="button"
                size="sm"
                variant={action === a ? 'default' : 'outline'}
                onClick={() => setAction(a)}
              >
                {a === 'approve' ? (de ? 'Genehmigen' : 'Approve')
                  : a === 'second-approve' ? (de ? '2. Genehmigung' : '2nd Approval')
                  : (de ? 'Bestreiten' : 'Dispute')}
              </Button>
            ))}
          </div>
          {action === 'dispute' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Begründung' : 'Reason'}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-8" required />
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{invoice?.supplierName}</span>
            {' — '}
            {fmt(invoice?.totalAmount, invoice?.currency)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button onClick={handleConfirm} disabled={isPending || (action === 'dispute' && !reason.trim())}>
            {isPending ? '...' : (de ? 'Bestätigen' : 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayablesPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [approveTarget, setApproveTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cursorStack, setCursorStack] = useState([null]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bankAccountId, setBankAccountId] = useState('');
  const cursor = cursorStack[cursorStack.length - 1];

  const filters = {
    limit: 50,
    ...(status !== 'ALL' && { status }),
    ...(search && { q: search }),
    ...(cursor && { cursor }),
  };

  const { data: { items = [], pagination } = {}, isLoading } = useApInvoices(filters);
  const { data: summary } = useApSummary();
  const { data: bankAccounts = [] } = useBankAccounts();
  const { data: accounts = [] } = useAccounts({ limit: 500 });
  const { createPaymentBatch } = useApMutations();
  const activeBankAccountId = bankAccountId || bankAccounts[0]?._id || '';

  const eligibleIds = items.filter(isBatchEligible).map((invoice) => String(invoice._id));
  const selectedInvoices = items.filter((invoice) => selectedIds.has(String(invoice._id)) && isBatchEligible(invoice));
  const selectedAmount = selectedInvoices.reduce((sum, invoice) => sum + Number(invoice.outstandingAmount || 0), 0);

  const resetList = () => {
    setCursorStack([null]);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(String(id)) ? next.delete(String(id)) : next.add(String(id));
      return next;
    });
  };

  const toggleCurrentPage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => next.has(id));
      eligibleIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleCreatePaymentBatch = async () => {
    if (!activeBankAccountId || selectedInvoices.length === 0) return;
    const response = await createPaymentBatch.mutateAsync({
      invoiceIds: selectedInvoices.map((invoice) => invoice._id),
      bankAccountId: activeBankAccountId,
    });
    const batch = response?.data;
    if (batch?._id) {
      const exportResponse = await apService.exportPaymentBatch(batch._id);
      downloadResponse(
        exportResponse,
        `${batch.batchNumber || 'payment-batch'}.xml`,
        'application/xml',
      );
    }
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Verbindlichkeiten' : 'Accounts Payable'}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {de ? 'Lieferantenrechnungen und Zahlungen' : 'Supplier invoices and payments'}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          {de ? 'Rechnung erfassen' : 'Record Invoice'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: de ? 'Offen' : 'Open',         value: fmt(summary?.openAmount), sub: `${summary?.openCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`, color: 'text-orange-600' },
          { label: de ? 'Überfällig' : 'Overdue',  value: fmt(summary?.overdueAmount), sub: `${summary?.overdueCount ?? 0} ${de ? 'überfällig' : 'overdue'}`, color: 'text-red-600' },
          { label: de ? 'Diesen Monat' : 'This Month', value: fmt(summary?.paidThisMonth), sub: de ? 'Bezahlt' : 'Paid', color: 'text-emerald-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder={de ? 'Lieferant suchen...' : 'Search supplier...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetList(); }}
          />
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value); resetList(); }}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Status' : 'All Statuses'}</SelectItem>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <SelectItem key={s} value={s}>{de ? STATUS_CONFIG[s].label : STATUS_CONFIG[s].labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedInvoices.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">
              {selectedInvoices.length} {de ? 'freigegebene Rechnungen' : 'approved invoices'} - {fmt(selectedAmount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {de ? 'Zahlungsbatch erstellen und pain.001 XML exportieren.' : 'Create a payment batch and export pain.001 XML.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={activeBankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="h-9 w-64 text-xs"><SelectValue placeholder={de ? 'Bankkonto' : 'Bank account'} /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account._id} value={account._id}>{account.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleCreatePaymentBatch} disabled={!activeBankAccountId || createPaymentBatch.isPending}>
              <Download className="h-4 w-4 mr-1.5" />
              pain.001
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={eligibleIds.length > 0 && eligibleIds.every((id) => selectedIds.has(id))}
                  onChange={toggleCurrentPage}
                  disabled={eligibleIds.length === 0}
                />
              </th>
              <th className="px-3 py-2.5 text-left">{de ? 'Rechnungsnr.' : 'Invoice No.'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Lieferant' : 'Supplier'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Fällig' : 'Due'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Betrag' : 'Amount'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Offen' : 'Outstanding'}</th>
              <th className="px-3 py-2.5 text-center">{de ? 'Status' : 'Status'}</th>
              <th className="px-3 py-2.5 w-28" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 9 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.map((inv) => {
              const isOverdue = inv.status !== 'PAID' && inv.status !== 'CANCELLED' && new Date(inv.dueDate) < new Date();
              const eligible = isBatchEligible(inv);
              return (
                <tr key={inv._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(inv._id))}
                      disabled={!eligible}
                      onChange={() => toggleSelected(inv._id)}
                    />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{inv.apInvoiceNumber}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{inv.supplierName}</p>
                    {inv.paymentBatchId && (
                      <p className="text-xs text-muted-foreground">
                        <CreditCard className="inline h-3 w-3 mr-1" />
                        {inv.paymentBatchId.batchNumber || inv.paymentBatchId}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{fmtDate(inv.invoiceDate)}</td>
                  <td className={`px-3 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                    {fmtDate(inv.dueDate)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(inv.totalAmount, inv.currency)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {inv.outstandingAmount > 0
                      ? <span className="text-orange-600 font-medium">{fmt(inv.outstandingAmount, inv.currency)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-3 text-center"><StatusBadge status={inv.status} de={de} /></td>
                  <td className="px-3 py-3 text-right">
                    {(inv.status === 'RECORDED' || inv.status === 'APPROVED') && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setApproveTarget(inv)}>
                        {de ? 'Aktion' : 'Action'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {de ? 'Keine Rechnungen vorhanden.' : 'No invoices found.'}
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

      {approveTarget && (
        <ApproveDialog
          invoice={approveTarget}
          open={!!approveTarget}
          onClose={() => setApproveTarget(null)}
          de={de}
        />
      )}
      <CreateApInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} accounts={accounts} de={de} />
    </div>
  );
}
