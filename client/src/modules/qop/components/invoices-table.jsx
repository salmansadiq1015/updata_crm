'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, MoreHorizontal, FileText, CheckCircle,
  Send, DollarSign, History, Download, XCircle, Edit, Trash2, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useInvoices, useInvoiceHistory } from '../hooks/use-qop-queries';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { invoiceService } from '../services/invoice-service';
import { showError } from '@/lib/toast';
import { InvoiceStatusBadge, InvoiceTypeBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { RecordPaymentDialog } from './record-payment-dialog';
import { InvoiceDetailDialog } from './invoice-detail-dialog';
import { QopBulkActionBar, QopPaginationControls, useQopCursorPagination } from './qop-pagination';
import { VALID_INVOICE_TRANSITIONS } from '../constants/qop-constants';

const INV_STATUSES = ['', 'DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF'];

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function HistoryDrawer({ open, onClose, invoiceId }) {
  const { t } = useLanguage();
  const { data: history = [], isLoading } = useInvoiceHistory(open ? invoiceId : null);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('qop.status.historyTitle', 'Verlauf')}</DialogTitle></DialogHeader>
        {isLoading ? <Skeleton className="h-32 w-full" /> : <DocumentHistoryTimeline history={history} className="mt-2" />}
      </DialogContent>
    </Dialog>
  );
}

export function InvoicesTable({ advancedFilters = {} }) {
  const { locale: language, t } = useLanguage();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('');
  const [formOpen, setFormOpen]       = useState(false);
  const [formType, setFormType]       = useState('STANDARD');
  const [payingInvoice, setPaying]    = useState(null);
  const [historyFor, setHistoryFor]   = useState(null);
  const [detailInvoiceId, setDetail]  = useState(null);
  const [writeOffInvoice, setWriteOffInvoice] = useState(null);
  const [writeOffReason, setWriteOffReason] = useState('');
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState('');

  const resetKey = useMemo(
    () => JSON.stringify({ advancedFilters, search: search.trim(), statusFilter }),
    [advancedFilters, search, statusFilter],
  );
  const pager = useQopCursorPagination(resetKey);

  const filters = useMemo(() => {
    const next = { ...advancedFilters, limit: pager.limit };
    if (pager.cursor) next.cursor = pager.cursor;
    if (search.trim()) next.search = search.trim();
    if (statusFilter) next.status = statusFilter;
    return next;
  }, [advancedFilters, pager.cursor, pager.limit, search, statusFilter]);

  const { data, isLoading } = useInvoices(filters);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const visibleIds = useMemo(() => items.map((invoice) => invoice._id ?? invoice.id), [items]);
  const selectedItems = useMemo(
    () => items.filter((invoice) => selectedIds.has(invoice._id ?? invoice.id)),
    [items, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const { finalizeInvoice, sendInvoice, transitionInvoiceStatus, deleteInvoice } = useInvoiceMutations();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
    setBulkStatus('');
  }, [resetKey, pager.cursor, pager.limit]);

  const clearSelection = () => setSelectedIds(new Set());
  const toggleSelected = (id, checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleVisible = (checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const handleGeneratePdf = async (id) => {
    try {
      const res = await invoiceService.generateDocument(id);
      const url = res?.data?.downloadUrl ?? res?.data?.url ?? res?.url;
      if (url) window.open(url, '_blank');
      else showError(t('qop.invoices.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    } catch (err) {
      showError(err?.message || t('qop.invoices.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    }
  };

  const handleFinalize = (id) => {
    if (confirm(t('qop.invoices.finalizeConfirm', 'Rechnung finalisieren? Dies kann nicht rückgängig gemacht werden.'))) {
      finalizeInvoice.mutate(id);
    }
  };
  const handleSend = (id) => sendInvoice.mutate(id);
  const handleDelete = (invoice) => {
    const id = invoice?._id ?? invoice?.id;
    if (!id) return;
    if (confirm(t('qop.invoices.deleteConfirm', 'Delete this invoice?'))) deleteInvoice.mutate(id);
  };
  const handleBulkDelete = async () => {
    const deletable = selectedItems.filter((invoice) => invoice.status === 'DRAFT');
    if (!deletable.length) return;
    if (!confirm(t('qop.bulk.deleteConfirm', 'Delete selected records?'))) return;
    const results = await Promise.allSettled(deletable.map((invoice) => deleteInvoice.mutateAsync(invoice._id ?? invoice.id)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    clearSelection();
  };
  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    const actionable = selectedItems.filter((invoice) => VALID_INVOICE_TRANSITIONS[invoice.status]?.includes(bulkStatus));
    if (!actionable.length) return;
    const results = await Promise.allSettled(actionable.map((invoice) => (
      transitionInvoiceStatus.mutateAsync({ id: invoice._id ?? invoice.id, targetStatus: bulkStatus })
    )));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    setBulkStatus('');
    clearSelection();
  };
  const handleWriteOff = async () => {
    const id = writeOffInvoice?._id ?? writeOffInvoice?.id;
    if (!id || !writeOffReason.trim()) return;
    await transitionInvoiceStatus.mutateAsync({
      id,
      targetStatus: 'WRITTEN_OFF',
      reason: writeOffReason.trim(),
    });
    setWriteOffInvoice(null);
    setWriteOffReason('');
  };

  const openNewForm = (type) => { setFormType(type); setFormOpen(true); };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm dark:bg-slate-950/50">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('qop.invoices.search', 'Rechnung suchen...')}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={t('qop.invoices.allStatuses', 'Alle Status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('qop.invoices.allStatuses', 'Alle Status')}</SelectItem>
            {INV_STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}><InvoiceStatusBadge status={s} /></SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* New Invoice dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5 ml-auto">
              <Plus className="h-3.5 w-3.5" />
              {t('qop.invoices.new', 'Neue Rechnung')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openNewForm('STANDARD')}>
              <FileText className="h-4 w-4 mr-2" />{t('qop.invoices.standard', 'Rechnung')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewForm('ADVANCE')}>
              <DollarSign className="h-4 w-4 mr-2" />{t('qop.invoices.advance', 'Akontorechnung')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openNewForm('FINAL')}>
              <CheckCircle className="h-4 w-4 mr-2" />{t('qop.invoices.final', 'Schlussrechnung')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <QopBulkActionBar selectedCount={selectedIds.size} onClear={clearSelection}>
        <Select value={bulkStatus || undefined} onValueChange={setBulkStatus}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={t('qop.bulk.statusPlaceholder', 'Set status')} />
          </SelectTrigger>
          <SelectContent>
            {INV_STATUSES.filter(Boolean).map((status) => (
              <SelectItem key={status} value={status}>
                <InvoiceStatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" className="h-8 gap-1.5" onClick={handleBulkStatus} disabled={!bulkStatus}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('qop.bulk.updateStatus', 'Update status')}
        </Button>
        <Button type="button" size="sm" variant="destructive" className="h-8 gap-1.5" onClick={handleBulkDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          {t('qop.bulk.delete', 'Delete')}
        </Button>
      </QopBulkActionBar>

      {/* Table */}
      <div className="overflow-x-auto rounded-t-xl border border-border/70 bg-card/80 shadow-sm dark:bg-slate-950/50">
        <div className="min-w-[1040px]">
        <div className="grid grid-cols-[2.5rem_9rem_10rem_minmax(10rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
          <div className="flex items-center justify-center px-3 py-2.5">
            <Checkbox
              checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
              onCheckedChange={(checked) => toggleVisible(Boolean(checked))}
              aria-label={t('qop.bulk.selectPage', 'Select visible rows')}
            />
          </div>
          {[
            t('qop.invoices.colNumber', 'Nummer'),
            t('qop.invoices.colType', 'Typ'),
            t('qop.invoices.colCustomer', 'Kunde'),
            t('qop.invoices.colStatus', 'Status'),
            t('qop.invoices.colDue', 'Fällig'),
            t('qop.invoices.colCreated', 'Erstellt'),
            t('qop.invoices.colAmount', 'Betrag'),
            '',
          ].map((h, i) => (
            <div key={i} className={`px-3 py-2.5 ${i >= 6 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>

        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_9rem_10rem_minmax(10rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 px-3 py-3 gap-2">
            {Array.from({ length: 9 }).map((_, j) => <Skeleton key={j} className="h-4 rounded" />)}
          </div>
        ))}

        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('qop.invoices.empty', 'Keine Rechnungen gefunden.')}
            </p>
          </div>
        )}

        {items.map((inv) => {
          const id = inv._id ?? inv.id;
          const canFinalize = inv.status === 'DRAFT';
          const canSend     = inv.status === 'DRAFT';
          const canPay      = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status);
          const canWriteOff = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status);

          return (
            <div
              key={id}
              className="grid grid-cols-[2.5rem_9rem_10rem_minmax(10rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 last:border-0 hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center justify-center px-3 py-3">
                <Checkbox
                  checked={selectedIds.has(id)}
                  onCheckedChange={(checked) => toggleSelected(id, Boolean(checked))}
                  aria-label={t('qop.bulk.selectRow', 'Select row')}
                />
              </div>
              <div
                className="px-3 py-3 text-sm font-mono text-muted-foreground cursor-pointer hover:text-foreground hover:underline"
                onClick={() => setDetail(id)}
              >{inv.invoiceNumber}</div>
              <div className="px-3 py-3"><InvoiceTypeBadge type={inv.invoiceType} /></div>
              <div className="px-3 py-3 text-sm font-medium truncate">
                {inv.customerName ?? inv.customer?.name ?? '—'}
              </div>
              <div className="px-3 py-3"><InvoiceStatusBadge status={inv.status} /></div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(inv.dueDate, language)}
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(inv.createdAt, language)}
              </div>
              <div className="px-3 py-3 text-sm text-right">
                <AmountDisplay amount={inv.grandTotalRounded ?? inv.grandTotal} currency={inv.currency} />
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {inv.status === 'DRAFT' && (
                      <DropdownMenuItem onClick={() => setEditingInvoice(inv)}>
                        <Edit className="h-4 w-4 mr-2" />{t('qop.table.edit', 'Edit')}
                      </DropdownMenuItem>
                    )}
                    {canFinalize && (
                      <DropdownMenuItem onClick={() => handleFinalize(id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />{t('qop.invoices.finalize', 'Finalisieren')}
                      </DropdownMenuItem>
                    )}
                    {canSend && (
                      <DropdownMenuItem onClick={() => handleSend(id)}>
                        <Send className="h-4 w-4 mr-2" />{t('qop.invoices.send', 'Senden')}
                      </DropdownMenuItem>
                    )}
                    {canPay && (
                      <DropdownMenuItem onClick={() => setPaying(inv)}>
                        <DollarSign className="h-4 w-4 mr-2" />{t('qop.invoices.recordPayment', 'Zahlung erfassen')}
                      </DropdownMenuItem>
                    )}
                    {canWriteOff && (
                      <DropdownMenuItem onClick={() => setWriteOffInvoice(inv)}>
                        <XCircle className="h-4 w-4 mr-2" />{t('qop.invoices.writeOff', 'Abschreiben')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleGeneratePdf(id)}>
                      <Download className="h-4 w-4 mr-2" />{t('qop.invoices.downloadPdf', 'PDF herunterladen')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setHistoryFor(id)}>
                      <History className="h-4 w-4 mr-2" />{t('qop.table.history', 'Verlauf')}
                    </DropdownMenuItem>
                    {inv.status === 'DRAFT' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(inv)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />{t('common.delete', 'Delete')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <QopPaginationControls
        pagination={data?.pagination}
        itemCount={items.length}
        limit={pager.limit}
        pageIndex={pager.pageIndex}
        canPrevious={pager.canPrevious}
        onLimitChange={pager.setLimit}
        onPrevious={pager.goPrevious}
        onNext={pager.goNext}
      />

      {/* Modals */}
      <InvoiceFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        type={formType}
      />
      <InvoiceFormDialog
        open={!!editingInvoice}
        onClose={() => setEditingInvoice(null)}
        invoice={editingInvoice}
      />
      {/* Prefill the still-open balance (amountDue), not the gross total: on a final
          invoice the balance is net of advance deductions, so grandTotal would overcharge. */}
      <RecordPaymentDialog
        open={!!payingInvoice}
        onClose={() => setPaying(null)}
        invoiceId={payingInvoice?._id ?? payingInvoice?.id}
        outstandingAmount={payingInvoice?.amountDue ?? payingInvoice?.grandTotalRounded ?? payingInvoice?.grandTotal}
        currency={payingInvoice?.currency ?? 'CHF'}
      />
      <HistoryDrawer
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        invoiceId={historyFor}
      />
      <InvoiceDetailDialog
        open={!!detailInvoiceId}
        onClose={() => setDetail(null)}
        invoiceId={detailInvoiceId}
      />
      <Dialog open={!!writeOffInvoice} onOpenChange={() => setWriteOffInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('qop.invoices.writeOffTitle', 'Rechnung abschreiben')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label>{t('qop.invoices.reason', 'Grund')}</Label>
            <Textarea
              value={writeOffReason}
              onChange={(event) => setWriteOffReason(event.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWriteOffInvoice(null)}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleWriteOff}
              disabled={!writeOffReason.trim() || transitionInvoiceStatus.isPending}
            >
              {t('qop.invoices.writeOff', 'Abschreiben')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
