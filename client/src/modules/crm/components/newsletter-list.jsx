'use client';

import { useState, useMemo, useCallback } from 'react';
import { newsletterService } from '@/modules/crm/services/newsletter-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useNewsletterMutations } from '@/modules/crm/hooks/use-newsletter-mutations';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { NewsletterCompose } from '@/modules/crm/components/newsletter-compose';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PermissionGate } from '@/shared/components/permission-gate';
import { PageHeader } from '@/shared/components/page-header';
import { EmptyState } from '@/shared/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, Send, Clock, XCircle, Eye,
  Mail, Search, BarChart3,
} from 'lucide-react';

const STATUS_META = {
  draft: { label: 'Draft', variant: 'secondary', icon: Pencil },
  scheduled: { label: 'Scheduled', variant: 'outline', icon: Clock },
  sending: { label: 'Sending', variant: 'default', icon: Send },
  sent: { label: 'Sent', variant: 'default', icon: Mail },
  cancelled: { label: 'Cancelled', variant: 'destructive', icon: XCircle },
};

export function NewsletterList() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [editNewsletter, setEditNewsletter] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [sendTarget, setSendTarget] = useState(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    return p;
  }, [debouncedSearch, statusFilter]);

  const {
    items: newsletters,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.newsletters.list(merged),
    queryFn: (merged) => newsletterService.getNewsletters(merged),
    params: apiParams,
    initialSize: 25,
  });

  const { create, update, remove, schedule, cancel, send } = useNewsletterMutations({
    onCreate: () => setComposeOpen(false),
    onUpdate: () => { setComposeOpen(false); setEditNewsletter(null); },
    onDelete: () => { setConfirmDeleteOpen(false); setDeleteTarget(null); },
    onSend: () => { setConfirmSendOpen(false); setSendTarget(null); },
  });

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    resetCursor();
  }, [resetCursor]);

  const hasActiveFilters = !!search || statusFilter !== 'all';

  const columns = useMemo(() => [
    {
      accessorKey: 'subject',
      header: t('crm.subject', 'Subject'),
      size: 320,
      Cell: ({ row }) => {
        const n = row.original;
        return (
          <div className="min-w-0">
            <span className="font-medium text-sm truncate block">
              {n.subject}
            </span>
            {n.createdBy && (
              <p className="text-xs text-muted-foreground truncate">
                {t('crm.by', 'by')} {n.createdBy.firstName} {n.createdBy.lastName}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('crm.status', 'Status'),
      size: 130,
      Cell: ({ row }) => {
        const n = row.original;
        const meta = STATUS_META[n.status] || STATUS_META.draft;
        const Icon = meta.icon;
        return (
          <Badge variant={meta.variant} className="gap-1.5">
            <Icon className="h-3 w-3" />
            {t(`crm.newsletter${meta.label}`, meta.label)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'recipientCount',
      header: t('crm.recipients', 'Recipients'),
      size: 110,
      Cell: ({ row }) => {
        const n = row.original;
        return (
          <span className="text-sm tabular-nums">
            {n.recipientCount || 0}
          </span>
        );
      },
    },
    {
      accessorKey: 'scheduledAt',
      header: t('crm.scheduleSentDate', 'Scheduled / Sent'),
      size: 180,
      Cell: ({ row }) => {
        const n = row.original;
        const date = n.sentAt || n.scheduledAt;
        if (!date) return <span className="text-xs text-muted-foreground/60">--</span>;
        return (
          <span className="text-xs">
            {formatDate(date)}
          </span>
        );
      },
    },
    {
      accessorKey: 'stats',
      header: t('crm.deliveryStats', 'Stats'),
      size: 180,
      Cell: ({ row }) => {
        const n = row.original;
        if (!n.stats || n.status === 'draft') {
          return <span className="text-xs text-muted-foreground/60">--</span>;
        }
        return (
          <div className="flex items-center gap-3 text-xs tabular-nums">
            <span className="text-green-600 dark:text-green-400" title="Sent">
              {n.stats.sent || 0}
            </span>
            <span className="text-blue-600 dark:text-blue-400" title="Delivered">
              {n.stats.delivered || 0}
            </span>
            <span className="text-red-600 dark:text-red-400" title="Failed">
              {n.stats.failed || 0}
            </span>
            <span className="text-amber-600 dark:text-amber-400" title="Opened">
              {n.stats.opened || 0}
            </span>
          </div>
        );
      },
    },
  ], [t]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('crm.newsletters', 'Newsletters')}
        description={t('crm.newslettersDescription', 'Compose and send newsletters to opted-in customers (nDSG compliant)')}
        actions={
          <PermissionGate permission="crm:admin">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => { setEditNewsletter(null); setComposeOpen(true); }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('crm.newNewsletter', 'New Newsletter')}
            </Button>
          </PermissionGate>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetCursor(); }}
            placeholder={t('crm.searchNewsletters', 'Search newsletters...')}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetCursor(); }}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue placeholder={t('crm.allStatuses', 'All statuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('crm.allStatuses', 'All statuses')}</SelectItem>
            <SelectItem value="draft">{t('crm.draft', 'Draft')}</SelectItem>
            <SelectItem value="scheduled">{t('crm.scheduled', 'Scheduled')}</SelectItem>
            <SelectItem value="sending">{t('crm.sending', 'Sending')}</SelectItem>
            <SelectItem value="sent">{t('crm.sent', 'Sent')}</SelectItem>
            <SelectItem value="cancelled">{t('crm.cancelled', 'Cancelled')}</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
            {t('common.clearFilters', 'Clear')}
          </Button>
        )}
      </div>

      {/* Table */}
      {newsletters.length === 0 && !isFetching ? (
        <EmptyState
          icon={Mail}
          title={t('crm.noNewsletters', 'No newsletters yet')}
          description={t('crm.noNewslettersDescription', 'Create your first newsletter to reach opted-in customers.')}
          action={
            hasPermission('crm:admin') ? (
              <Button
                size="sm"
                onClick={() => { setEditNewsletter(null); setComposeOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {t('crm.createNewsletter', 'Create Newsletter')}
              </Button>
            ) : null
          }
        />
      ) : (
        <DataTableShell
          columns={columns}
          data={newsletters}
          isLoading={isFetching && newsletters.length === 0}
          rowCount={newsletters.length}
          manualPagination
          manualSorting
          manualFiltering
          enableGlobalFilter={false}
          cursorPagination={{
            pageSize,
            onPageSizeChange: setPageSize,
            hasNext,
            hasPrev,
            isFetching,
            onNext,
            onPrev,
          }}
          renderRowActions={({ row }) => {
            const n = row.original;
            const isDraft = n.status === 'draft';
            const isScheduled = n.status === 'scheduled';
            const canAdmin = hasPermission('crm:admin');

            return (
              <RowActionsMenu
                items={[
                  {
                    label: t('common.edit', 'Edit'),
                    icon: Pencil,
                    hidden: !canAdmin || (!isDraft && !isScheduled),
                    onSelect: () => { setEditNewsletter(n); setComposeOpen(true); },
                  },
                  {
                    label: t('crm.sendNow', 'Send Now'),
                    icon: Send,
                    hidden: !canAdmin || (!isDraft && !isScheduled),
                    onSelect: () => { setSendTarget(n); setConfirmSendOpen(true); },
                  },
                  {
                    label: t('crm.cancelSchedule', 'Cancel Schedule'),
                    icon: XCircle,
                    hidden: !canAdmin || !isScheduled,
                    onSelect: () => cancel.mutate(n._id),
                  },
                  {
                    label: t('crm.viewStats', 'View Stats'),
                    icon: BarChart3,
                    hidden: n.status === 'draft',
                    onSelect: () => { /* future: open stats dialog */ },
                  },
                  { type: 'separator', hidden: !isDraft || !canAdmin },
                  {
                    label: t('common.delete', 'Delete'),
                    icon: Trash2,
                    destructive: true,
                    hidden: !canAdmin || !isDraft,
                    onSelect: () => { setDeleteTarget(n); setConfirmDeleteOpen(true); },
                  },
                ]}
              />
            );
          }}
        />
      )}

      {/* Compose / Edit Dialog */}
      {composeOpen && (
        <NewsletterCompose
          open={composeOpen}
          onOpenChange={(open) => {
            setComposeOpen(open);
            if (!open) setEditNewsletter(null);
          }}
          newsletter={editNewsletter}
          onCreate={(data) => create.mutate(data)}
          onUpdate={(id, data) => update.mutate({ id, data })}
          onSchedule={(id, scheduledAt) => schedule.mutate({ id, scheduledAt })}
          onSend={(id) => send.mutate(id)}
          isCreating={create.isPending}
          isUpdating={update.isPending}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t('crm.deleteNewsletter', 'Delete Newsletter')}
        description={t(
          'crm.deleteNewsletterConfirm',
          'Are you sure you want to delete "{subject}"? This action cannot be undone.',
          { subject: deleteTarget?.subject || '' },
        )}
        confirmLabel={t('common.delete', 'Delete')}
        variant="destructive"
        isPending={remove.isPending}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget._id)}
      />

      {/* Send Confirmation */}
      <ConfirmDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title={t('crm.sendNewsletter', 'Send Newsletter')}
        description={t(
          'crm.sendNewsletterConfirm',
          'Are you sure you want to send "{subject}" now? This will email all opted-in recipients immediately.',
          { subject: sendTarget?.subject || '' },
        )}
        confirmLabel={t('crm.sendNow', 'Send Now')}
        isPending={send.isPending}
        onConfirm={() => sendTarget && send.mutate(sendTarget._id)}
      />
    </div>
  );
}
