'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useCustomerMutations } from '@/modules/crm/hooks/use-customer-mutations';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { CustomerForm } from '@/modules/crm/components/customer-form';
import { CustomerCard } from '@/modules/crm/components/customer-card';
import { CustomerFilterBar } from '@/modules/crm/components/customer-filter-bar';
import { CustomerStatsRow } from '@/modules/crm/components/customer-stats-row';
import { CustomerMergeDialog } from '@/modules/crm/components/customer-merge-dialog';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PermissionGate } from '@/shared/components/permission-gate';
import { PageHeader } from '@/shared/components/page-header';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { Button } from '@/components/ui/button';
import { showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useRouter } from 'next/navigation';
import { formatPhone } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Archive, Eye, Building2, User,
  Users as UsersIcon, BellRing,
  LayoutGrid, List, Mail, Download, GitMerge,
} from 'lucide-react';
import { pickCustomerAccent } from '@/modules/crm/constants/customer-constants';

export function CustomersTable() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const [viewMode, setViewMode] = useState('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cantonFilter, setCantonFilter] = useState('all');
  const [newsletterFilter, setNewsletterFilter] = useState('all');

  const debouncedSearch = useDebounce(search, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState(null);

  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.type = typeFilter;
    if (cantonFilter !== 'all') p.canton = cantonFilter;
    if (newsletterFilter === 'optin') p.newsletterOptIn = 'true';
    if (newsletterFilter === 'optout') p.newsletterOptIn = 'false';
    return p;
  }, [debouncedSearch, statusFilter, typeFilter, cantonFilter, newsletterFilter]);

  const {
    items: customers,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (merged) => queryKeys.crm.customers.list(merged),
    queryFn: (merged) => customerService.getCustomers(merged),
    params: apiParams,
    initialSize: 25,
  });

  const { create, update, archive, bulkArchive, merge, exportCsv } = useCustomerMutations({
    onCreate: () => setFormOpen(false),
    onUpdate: () => setFormOpen(false),
    onArchive: () => setConfirmArchiveOpen(false),
    onBulkArchive: () => {
      setRowSelection({});
      setBulkArchiveOpen(false);
    },
    onMerge: () => {
      setMergeOpen(false);
      setMergeSource(null);
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => {
    const c = customers.find((x) => x._id === id);
    return c && c.status !== 'archived';
  });

  const hasActiveFilters =
    !!search ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    cantonFilter !== 'all' ||
    newsletterFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setCantonFilter('all');
    setNewsletterFilter('all');
    resetCursor();
  }, [resetCursor]);

  const pageStats = useMemo(() => {
    const total = customers.length;
    const priv = customers.filter((c) => c.type === 'private').length;
    const biz = customers.filter((c) => c.type === 'business').length;
    const news = customers.filter((c) => !!c.newsletterOptIn).length;
    return { total, priv, biz, news };
  }, [customers]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('crm.customer', 'Customer'),
      size: 320,
      Cell: ({ row }) => {
        const c = row.original;
        const accent = pickCustomerAccent(c);
        const Icon = c.type === 'business' ? Building2 : User;
        return (
          <Link href={`/crm/customers/${c._id}`} className="flex items-center gap-3 group min-w-0">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 shrink-0', accent.bg, accent.ring)}>
              <Icon className={cn('h-4 w-4', accent.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {c.name}
                </span>
                {c.customerNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {c.customerNumber}
                  </span>
                )}
              </div>
              {c.email && (
                <p className="text-xs text-muted-foreground truncate">{c.email}</p>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'type',
      header: t('crm.type', 'Type'),
      size: 120,
      Cell: ({ row }) => {
        const c = row.original;
        const isBiz = c.type === 'business';
        return (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            isBiz
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isBiz ? 'bg-emerald-500' : 'bg-blue-500')} />
            {isBiz ? t('crm.typeBusiness', 'Business') : t('crm.typePrivate', 'Private')}
          </span>
        );
      },
    },
    {
      accessorKey: 'address',
      header: t('crm.address', 'Address'),
      size: 220,
      Cell: ({ row }) => {
        const c = row.original;
        const line = [c.postalCode, c.city].filter(Boolean).join(' ');
        if (!line) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <span className="text-xs">
            {line}
            {c.canton && <span className="text-muted-foreground"> · {c.canton}</span>}
          </span>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: t('crm.phone', 'Phone'),
      size: 150,
      Cell: ({ row }) => {
        const c = row.original;
        const phone = c.phone || c.mobile;
        if (!phone) return <span className="text-xs text-muted-foreground/60">—</span>;
        const display = formatPhone(phone);
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(phone);
              showSuccess(t('crm.copyPhone', 'Phone copied'));
            }}
            className="text-xs hover:text-primary transition-colors"
          >
            {display}
          </button>
        );
      },
    },
    {
      accessorKey: 'newsletterOptIn',
      header: t('crm.newsletter', 'Newsletter'),
      size: 110,
      Cell: ({ row }) => (row.original.newsletterOptIn
        ? <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <BellRing className="h-3.5 w-3.5" />
            {t('crm.optedIn', 'Opted in')}
          </span>
        : <span className="text-xs text-muted-foreground/50">—</span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('crm.status', 'Status'),
      size: 130,
      Cell: ({ row }) => {
        const isArchived = row.original.status === 'archived';
        return (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            isArchived
              ? 'bg-muted text-muted-foreground'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isArchived ? 'bg-muted-foreground/40' : 'bg-emerald-500')} />
            {isArchived ? t('crm.statusArchived', 'Archived') : t('crm.statusActive', 'Active')}
          </span>
        );
      },
    },
  ], [t]);

  const handleSubmit = async (data) => {
    if (editCustomer?._id) {
      await update.mutateAsync({ id: editCustomer._id, data });
    } else {
      await create.mutateAsync(data);
    }
    setEditCustomer(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('crm.customersTitle', 'Customer management')}
        description={t('crm.customersDesc', 'Create, edit, and manage customers and their objects.')}
        count={customers.length}
      >
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md transition-all',
              viewMode === 'table' ? 'bg-card shadow-theme-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('common.viewTable', 'Table view')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md transition-all',
              viewMode === 'grid' ? 'bg-card shadow-theme-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('common.viewGrid', 'Grid view')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        <PermissionGate permission="crm:read">
          <Button
            variant="outline"
            onClick={() => exportCsv.mutate(apiParams)}
            disabled={exportCsv.isPending}
            className="gap-2 h-9"
          >
            <Download className="h-4 w-4" />
            {exportCsv.isPending ? t('common.exporting', 'Exporting...') : t('crm.exportCsv', 'Export CSV')}
          </Button>
        </PermissionGate>

        <PermissionGate permission="crm:write">
          <Button
            onClick={() => { setEditCustomer(null); setFormOpen(true); }}
            className="gap-2 h-9 shadow-theme-sm hover:shadow-theme-md transition-all"
          >
            <Plus className="h-4 w-4" />
            {t('crm.newCustomer', 'New customer')}
          </Button>
        </PermissionGate>
      </PageHeader>

      <CustomerStatsRow t={t} stats={pageStats} />

      <CustomerFilterBar
        t={t}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        cantonFilter={cantonFilter}
        onCantonFilterChange={setCantonFilter}
        newsletterFilter={newsletterFilter}
        onNewsletterFilterChange={setNewsletterFilter}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      {selectedIds.length > 0 && (
        <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
          <PermissionGate permission="crm:admin">
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setBulkArchiveOpen(true)}
            >
              <Archive className="h-3.5 w-3.5 mr-1" />
              {t('crm.bulkArchive', 'Archive {count}', { count: selectedIds.length })}
            </Button>
          </PermissionGate>
        </BulkActionsBar>
      )}

      {viewMode === 'table' ? (
        <DataTableShell
          columns={columns}
          data={customers}
          isLoading={isFetching && customers.length === 0}
          rowCount={customers.length}
          manualPagination
          manualSorting
          manualFiltering
          enableGlobalFilter={false}
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
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
            const c = row.original;
            const isArchived = c.status === 'archived';
            const canWrite = hasPermission('crm:write');
            const canAdmin = hasPermission('crm:admin');
            const canDelete = hasPermission('crm:delete');
            return (
              <RowActionsMenu
                items={[
                  {
                    label: t('common.view', 'View'),
                    icon: Eye,
                    onSelect: () => router.push(`/crm/customers/${c._id}`),
                  },
                  {
                    label: t('common.edit', 'Edit'),
                    icon: Pencil,
                    hidden: !canWrite,
                    onSelect: () => { setEditCustomer(c); setFormOpen(true); },
                  },
                  {
                    label: t('crm.copyEmail', 'Copy email'),
                    icon: Mail,
                    hidden: !c.email,
                    onSelect: () => {
                      navigator.clipboard.writeText(c.email);
                      showSuccess(t('crm.copyEmail', 'Email copied'));
                    },
                  },
                  { type: 'separator', hidden: isArchived || (!canAdmin && !canDelete) },
                  {
                    label: t('crm.merge', 'Merge'),
                    icon: GitMerge,
                    hidden: isArchived || !canAdmin,
                    onSelect: () => { setMergeSource(c); setMergeOpen(true); },
                  },
                  {
                    label: t('crm.archive', 'Archive'),
                    icon: Archive,
                    destructive: true,
                    hidden: isArchived || !canDelete,
                    onSelect: () => { setArchiveTarget(c); setConfirmArchiveOpen(true); },
                  },
                ]}
              />
            );
          }}
        />
      ) : (
        <div className="space-y-4">
          {isFetching && customers.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-[220px]" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed border-border bg-card/50">
              <UsersIcon className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm font-medium">{t('crm.noCustomers', 'No customers')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {customers.map((c) => (
                  <CustomerCard
                    key={c._id}
                    customer={c}
                    t={t}
                    onEdit={() => { setEditCustomer(c); setFormOpen(true); }}
                    onArchive={() => { setArchiveTarget(c); setConfirmArchiveOpen(true); }}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between px-2 py-2.5 text-xs">
                <div className="text-muted-foreground">
                  {t('crm.customerCount', '{count} customers', { count: customers.length })}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md text-xs" onClick={onPrev} disabled={!hasPrev || isFetching}>
                    {t('common.prev', 'Previous')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md text-xs" onClick={onNext} disabled={!hasNext || isFetching}>
                    {t('common.next', 'Next')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editCustomer}
        isLoading={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={t('crm.confirmArchive', 'Archive customer?')}
        description={`${t('crm.archiveDesc', 'Are you sure you want to archive this customer?')} ${archiveTarget?.name ? `— "${archiveTarget.name}"` : ''}`}
        onConfirm={() => archive.mutate(archiveTarget?._id)}
        loading={archive.isPending}
        confirmText={t('crm.archive', 'Archive')}
        variant="destructive"
      />

      <ConfirmDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={t('crm.bulkArchiveTitle', 'Archive {count} customers?', { count: selectedIds.length })}
        description={t(
          'crm.bulkArchiveDesc',
          'The selected customers will be archived. You can restore them later via the status filter.',
        )}
        onConfirm={() => bulkArchive.mutate(selectedIds)}
        loading={bulkArchive.isPending}
        confirmText={t('crm.bulkArchiveConfirm', 'Archive all')}
        variant="destructive"
      />

      <CustomerMergeDialog
        open={mergeOpen}
        onOpenChange={(v) => { setMergeOpen(v); if (!v) setMergeSource(null); }}
        source={mergeSource}
        loading={merge.isPending}
        onConfirm={({ sourceId, targetId }) => merge.mutate({ sourceId, targetId })}
      />
    </div>
  );
}
