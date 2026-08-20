'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, MoreHorizontal, Eye, FileText, Plus, Edit, RefreshCw, Trash2,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';
import { useOrders } from '../hooks/use-qop-queries';
import { useOrderMutations } from '../hooks/use-qop-mutations';
import { orderService } from '../services/order-service';
import { OrderStatusBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { OrderDetailDialog } from './order-detail-dialog';
import { OrderFormDialog } from './order-form-dialog';
import { QopBulkActionBar, QopPaginationControls, useQopCursorPagination } from './qop-pagination';
import { VALID_ORDER_TRANSITIONS } from '../constants/qop-constants';

const ORDER_STATUSES = ['', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

function fmtDate(d, lang) {
  if (!d) return '-';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

export function OrdersTable({ advancedFilters = {} }) {
  const { locale: language, t } = useLanguage();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
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

  const { data, isLoading } = useOrders(filters);
  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const visibleIds = useMemo(() => items.map((order) => order._id ?? order.id), [items]);
  const selectedItems = useMemo(
    () => items.filter((order) => selectedIds.has(order._id ?? order.id)),
    [items, selectedIds],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  const { deleteOrder, transitionOrderStatus } = useOrderMutations();

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

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (order) => {
    setEditing(order);
    setFormOpen(true);
  };

  const handleDelete = (order) => {
    const id = order._id ?? order.id;
    if (!id) return;
    if (confirm(t('qop.orders.deleteConfirm', 'Delete this order?'))) deleteOrder.mutate(id);
  };

  const handlePreviewPdf = async (id) => {
    try {
      const res = await orderService.generateDocument(id);
      const url = res?.data?.downloadUrl ?? res?.data?.url ?? res?.url;
      const fileName = res?.data?.fileName ?? res?.data?.filename ?? 'order.pdf';
      if (url) await downloadFromUrl(url, fileName);
      else showError(t('qop.actions.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    } catch (err) {
      showError(err?.message || t('qop.actions.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    }
  };

  const handleBulkDelete = async () => {
    const deletable = selectedItems.filter((order) => order.status === 'CONFIRMED');
    if (!deletable.length) return;
    if (!confirm(t('qop.bulk.deleteConfirm', 'Delete selected records?'))) return;
    const results = await Promise.allSettled(deletable.map((order) => deleteOrder.mutateAsync(order._id ?? order.id)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    clearSelection();
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus) return;
    const actionable = selectedItems.filter((order) => VALID_ORDER_TRANSITIONS[order.status]?.includes(bulkStatus));
    if (!actionable.length) return;
    const results = await Promise.allSettled(actionable.map((order) => (
      transitionOrderStatus.mutateAsync({ id: order._id ?? order.id, targetStatus: bulkStatus })
    )));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) alert(t('qop.bulk.partialFailure', '{count} records could not be processed.', { count: failed }));
    setBulkStatus('');
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm dark:bg-slate-950/50">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('qop.orders.search', 'Search orders...')}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(value) => setStatus(value === 'ALL' ? '' : value)}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder={t('qop.orders.allStatuses', 'All Statuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('qop.orders.allStatuses', 'All Statuses')}</SelectItem>
            {ORDER_STATUSES.filter(Boolean).map((status) => (
              <SelectItem key={status} value={status}><OrderStatusBadge status={status} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          {t('qop.orders.new', 'New Order')}
        </Button>
      </div>

      <QopBulkActionBar selectedCount={selectedIds.size} onClear={clearSelection}>
        <Select value={bulkStatus || undefined} onValueChange={setBulkStatus}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={t('qop.bulk.statusPlaceholder', 'Set status')} />
          </SelectTrigger>
          <SelectContent>
            {ORDER_STATUSES.filter(Boolean).map((status) => (
              <SelectItem key={status} value={status}>
                <OrderStatusBadge status={status} />
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

      <div className="overflow-x-auto rounded-t-xl border border-border/70 bg-card/80 shadow-sm dark:bg-slate-950/50">
        <div className="min-w-[940px]">
          <div className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 bg-muted/40 text-xs font-medium text-muted-foreground">
            <div className="flex items-center justify-center px-3 py-2.5">
              <Checkbox
                checked={allVisibleSelected || (someVisibleSelected ? 'indeterminate' : false)}
                onCheckedChange={(checked) => toggleVisible(Boolean(checked))}
                aria-label={t('qop.bulk.selectPage', 'Select visible rows')}
              />
            </div>
            {[
              t('qop.orders.colNumber', 'Number'),
              t('qop.orders.colCustomer', 'Customer'),
              t('qop.orders.colStatus', 'Status'),
              t('qop.orders.colCreated', 'Created'),
              t('qop.orders.colSource', 'From Quote'),
              t('qop.orders.colAmount', 'Amount'),
              '',
            ].map((header, index) => (
              <div key={header || index} className={`px-3 py-2.5 ${index >= 5 ? 'text-right' : ''}`}>{header}</div>
            ))}
          </div>

          {isLoading && Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 px-3 py-3 gap-2">
              {Array.from({ length: 8 }).map((__, cell) => <Skeleton key={cell} className="h-4 rounded" />)}
            </div>
          ))}

          {!isLoading && items.length === 0 && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {t('qop.orders.empty', 'No orders found.')}
              </p>
            </div>
          )}

          {items.map((order) => {
            const id = order._id ?? order.id;
            return (
              <div
                key={id}
                className="grid grid-cols-[2.5rem_9rem_minmax(14rem,1fr)_8rem_7rem_7rem_8rem_2.75rem] border-b border-border/70 last:border-0 transition-colors hover:bg-primary/5 group cursor-pointer"
                onClick={() => setDetailId(id)}
              >
                <div className="flex items-center justify-center px-3 py-3" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(id)}
                    onCheckedChange={(checked) => toggleSelected(id, Boolean(checked))}
                    aria-label={t('qop.bulk.selectRow', 'Select row')}
                  />
                </div>
                <div className="px-3 py-3 text-sm font-mono text-muted-foreground">{order.orderNumber}</div>
                <div className="px-3 py-3 text-sm font-medium truncate">
                  {order.customerName ?? order.customer?.name ?? '-'}
                </div>
                <div className="px-3 py-3"><OrderStatusBadge status={order.status} /></div>
                <div className="px-3 py-3 text-sm text-muted-foreground">{fmtDate(order.createdAt, language)}</div>
                <div className="px-3 py-3 text-sm text-muted-foreground font-mono">
                  {order.sourceQuotationNumber ?? '-'}
                </div>
                <div className="px-3 py-3 text-right text-sm">
                  <AmountDisplay amount={order.grandTotalRounded ?? order.grandTotal} currency={order.currency} />
                </div>
                <div className="flex items-center justify-center px-1 py-2" onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setDetailId(id)}>
                        <Eye className="mr-2 h-4 w-4" />{t('qop.orders.viewDetails', 'View Details')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handlePreviewPdf(id)}>
                        <FileText className="mr-2 h-4 w-4" />{t('qop.actions.preview', 'Vorschau')}
                      </DropdownMenuItem>
                      {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
                        <DropdownMenuItem onClick={() => openEdit(order)}>
                          <Edit className="mr-2 h-4 w-4" />{t('qop.table.edit', 'Edit')}
                        </DropdownMenuItem>
                      )}
                      {VALID_ORDER_TRANSITIONS[order.status]?.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => transitionOrderStatus.mutate({ id, targetStatus: status })}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />{t(`qop.status.${status}`, status)}
                        </DropdownMenuItem>
                      ))}
                      {order.status === 'CONFIRMED' && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(order)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />{t('common.delete', 'Delete')}
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

      <OrderDetailDialog
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        orderId={detailId}
      />
      <OrderFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        order={editing}
      />
    </div>
  );
}
