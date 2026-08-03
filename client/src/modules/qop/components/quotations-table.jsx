'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, MoreHorizontal, Copy, Send,
  ArrowRight, Trash2, History, RefreshCw, FileText, LayoutTemplate, Eye,
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
import { useQuotations, useQuotationHistory } from '../hooks/use-qop-queries';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import { QuotationStatusBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { quotationService } from '../services/quotation-service';
import { showError } from '@/lib/toast';
import { QuotationFormDialog } from './quotation-form-dialog';
import { ConvertToOrderDialog } from './convert-to-order-dialog';
import { InvoiceFormDialog } from './invoice-form-dialog';
import { QuotationTemplateManager } from './quotation-template-manager';
import { VALID_QUOTATION_TRANSITIONS } from '../constants/qop-constants';
import { QopBulkActionBar, QopPaginationControls, useQopCursorPagination } from './qop-pagination';

const STATUSES = ['', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED'];

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function StatusTransitionDialog({ open, onClose, quotation, onConfirm }) {
  const { t } = useLanguage();
  const current = quotation?.status ?? '';
  const allowed = VALID_QUOTATION_TRANSITIONS[current] ?? [];
  const [targetStatus, setTargetStatus] = useState(allowed[0] ?? '');
  const [reason, setReason] = useState('');

  if (!allowed.length) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('qop.status.changeTitle', 'Status ändern')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t('qop.status.newStatus', 'Neuer Status')}</Label>
            <Select value={targetStatus} onValueChange={setTargetStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowed.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`qop.status.${s}`, s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(targetStatus === 'DECLINED' || targetStatus === 'CANCELLED') && (
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.status.reason', 'Grund (optional)')}</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none text-sm"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel', 'Abbrechen')}</Button>
          <Button onClick={() => onConfirm(targetStatus, reason)}>
            {t('common.confirm', 'Bestätigen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDrawer({ open, onClose, quotationId }) {
  const { t } = useLanguage();
  const { data: history = [], isLoading } = useQuotationHistory(open ? quotationId : null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('qop.status.historyTitle', 'Statusverlauf')}</DialogTitle>
        </DialogHeader>
        {isLoading
          ? <Skeleton className="h-32 w-full" />
          : <DocumentHistoryTimeline history={history} className="mt-2" />}
      </DialogContent>
    </Dialog>
  );
}

export function QuotationsTable({ advancedFilters = {} }) {
  const { locale: language, t } = useLanguage();

  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [formOpen, setFormOpen]             = useState(false);
  const [editing, setEditing]               = useState(null);
  const [transitioning, setTrans]           = useState(null);
  const [historyFor, setHistoryFor]         = useState(null);
  const [convertTarget, setConvertTarget]   = useState(null);
  const [invoiceTarget, setInvoiceTarget]   = useState(null);
  const [templateMgrOpen, setTemplateMgr]  = useState(false);
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

  const { data, isLoading } = useQuotations(filters);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const visibleIds = useMemo(() => items.map((quotation) => quotation._id ?? quotation.id), [items]);
  const selectedItems = useMemo(
    () => items.filter((quotation) => selectedIds.has(quotation._id ?? quotation.id)),
    [items, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const {
    deleteQuotation, duplicateQuotation, sendQuotation,
    transitionQuotationStatus,
  } = useQuotationMutations();

  const handleDelete    = (id) => {
    if (confirm(t('qop.table.deleteConfirm', 'Offerte löschen?'))) deleteQuotation.mutate(id);
  };
  const handleDuplicate = (id) => duplicateQuotation.mutate(id);
  const handleSend      = (id) => sendQuotation.mutate(id);
  const handlePreviewPdf = async (id) => {
    try {
      const res = await quotationService.generateDocument(id);
      const url = res?.data?.downloadUrl ?? res?.data?.url ?? res?.url;
      if (url) window.open(url, '_blank');
      else showError(t('qop.actions.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    } catch (err) {
      showError(err?.message || t('qop.actions.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    }
  };
  const handleTransitionConfirm = (targetStatus, reason) => {
    transitionQuotationStatus.mutate({
      id: transitioning._id ?? transitioning.id,
      targetStatus,
      reason,
    });
    setTrans(null);
  };
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
  const handleBulkDelete = async () => {
    const deletable = selectedItems.filter((quotation) => quotation.status === 'DRAFT');
    if (!deletable.length) return;
    if (!confirm(t('qop.bulk.deleteConfirm', 'Delete selected records?'))) return;
    const results = await Promise.allSettled(deletable.map((quotation) => deleteQuotation.mutateAsync(quotation._id ?? quotation.id)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    clearSelection();
  };
  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    const actionable = selectedItems.filter((quotation) => (
      VALID_QUOTATION_TRANSITIONS[quotation.status]?.includes(bulkStatus)
    ));
    if (!actionable.length) return;
    const results = await Promise.allSettled(actionable.map((quotation) => (
      transitionQuotationStatus.mutateAsync({
        id: quotation._id ?? quotation.id,
        targetStatus: bulkStatus,
      })
    )));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    setBulkStatus('');
    clearSelection();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIds(new Set());
    setBulkStatus('');
  }, [resetKey, pager.cursor, pager.limit]);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm dark:bg-slate-950/50">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('qop.table.search', 'Offerte suchen...')}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={t('qop.table.allStatuses', 'Alle Status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('qop.table.allStatuses', 'Alle Status')}</SelectItem>
            {STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}><QuotationStatusBadge status={s} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setTemplateMgr(true)}>
          <LayoutTemplate className="h-3.5 w-3.5" />
          {t('qop.table.templates', 'Vorlagen')}
        </Button>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5" />
          {t('qop.table.newQuotation', 'Neue Offerte')}
        </Button>
      </div>

      <QopBulkActionBar selectedCount={selectedIds.size} onClear={clearSelection}>
        <Select value={bulkStatus || undefined} onValueChange={setBulkStatus}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={t('qop.bulk.statusPlaceholder', 'Set status')} />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.filter(Boolean).map((s) => (
              <SelectItem key={s} value={s}>{t(`qop.status.${s}`, s)}</SelectItem>
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
        <div className="min-w-[920px]">
        {/* Header */}
        <div className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
          <div className="flex items-center justify-center px-3 py-2.5">
            <Checkbox
              checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
              onCheckedChange={(checked) => toggleVisible(Boolean(checked))}
              aria-label={t('qop.bulk.selectPage', 'Select visible rows')}
            />
          </div>
          {[
            t('qop.table.colNumber', 'Nummer'),
            t('qop.table.colCustomer', 'Kunde'),
            t('qop.table.colStatus', 'Status'),
            t('qop.table.colValidUntil', 'Gültig bis'),
            t('qop.table.colCreated', 'Erstellt'),
            t('qop.table.colAmount', 'Betrag'),
            '',
          ].map((h, i) => (
            <div key={i} className={`px-3 py-2.5 ${i >= 5 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>

        {/* Loading */}
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 last:border-0 px-3 py-2.5 gap-2">
            {Array.from({ length: 8 }).map((_, j) => <Skeleton key={j} className="h-4 w-full rounded" />)}
          </div>
        ))}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('qop.table.empty', 'Keine Offerten gefunden.')}
            </p>
          </div>
        )}

        {/* Rows */}
        {items.map((q) => {
          const id = q._id ?? q.id;
          return (
            <div
              key={id}
              className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 last:border-0 hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center justify-center px-3 py-3">
                <Checkbox
                  checked={selectedIds.has(id)}
                  onCheckedChange={(checked) => toggleSelected(id, Boolean(checked))}
                  aria-label={t('qop.bulk.selectRow', 'Select row')}
                />
              </div>
              <div className="px-3 py-3 text-sm font-mono text-muted-foreground">
                {q.quotationNumber}
              </div>
              <div className="px-3 py-3 text-sm font-medium truncate">
                {q.customerName ?? q.customer?.name ?? '—'}
              </div>
              <div className="px-3 py-3">
                <QuotationStatusBadge status={q.status} />
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(q.validUntil, language)}
              </div>
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {fmtDate(q.createdAt, language)}
              </div>
              <div className="px-3 py-3 text-sm text-right">
                <AmountDisplay amount={q.grandTotalRounded ?? q.grandTotal} currency={q.currency} />
              </div>
              <div className="px-1 py-2 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => { setEditing(q); setFormOpen(true); }}>
                      <FileText className="h-4 w-4 mr-2" />{t('qop.table.edit', 'Bearbeiten')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicate(id)}>
                      <Copy className="h-4 w-4 mr-2" />{t('qop.table.duplicate', 'Duplizieren')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePreviewPdf(id)}>
                      <Eye className="h-4 w-4 mr-2" />{t('qop.actions.preview', 'Vorschau')}
                    </DropdownMenuItem>
                    {q.status === 'DRAFT' && (
                      <DropdownMenuItem onClick={() => handleSend(id)}>
                        <Send className="h-4 w-4 mr-2" />{t('qop.table.send', 'Senden')}
                      </DropdownMenuItem>
                    )}
                    {q.status === 'ACCEPTED' && (
                      <DropdownMenuItem onClick={() => setConvertTarget(q)}>
                        <ArrowRight className="h-4 w-4 mr-2" />{t('qop.table.convertToOrder', 'In Auftrag konvertieren')}
                      </DropdownMenuItem>
                    )}
                    {['ACCEPTED', 'CONVERTED'].includes(q.status) && (
                      <DropdownMenuItem onClick={() => setInvoiceTarget(q)}>
                        <FileText className="h-4 w-4 mr-2" />{t('qop.table.createInvoice', 'Rechnung erstellen')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setTrans(q)}>
                      <RefreshCw className="h-4 w-4 mr-2" />{t('qop.status.changeTitle', 'Status ändern')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFor(id)}>
                      <History className="h-4 w-4 mr-2" />{t('qop.table.history', 'Verlauf')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {q.status === 'DRAFT' && (
                      <DropdownMenuItem
                        onClick={() => handleDelete(id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />{t('common.delete', 'Löschen')}
                      </DropdownMenuItem>
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
      <QuotationFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        quotation={editing}
      />
      <StatusTransitionDialog
        open={!!transitioning}
        onClose={() => setTrans(null)}
        quotation={transitioning}
        onConfirm={handleTransitionConfirm}
      />
      <HistoryDrawer
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        quotationId={historyFor}
      />
      <ConvertToOrderDialog
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        quotation={convertTarget}
      />
      <InvoiceFormDialog
        open={!!invoiceTarget}
        onClose={() => setInvoiceTarget(null)}
        type="STANDARD"
        sourceQuotationId={invoiceTarget?._id ?? invoiceTarget?.id}
        sourceQuotation={invoiceTarget}
      />
      <QuotationTemplateManager
        open={templateMgrOpen}
        onClose={() => setTemplateMgr(false)}
      />
    </div>
  );
}
