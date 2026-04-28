'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsOrderFilters } from './field-ops-order-filters';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { ORDER_TYPE_LABELS, REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function FieldOpsOrdersTable() {
  const { t, language } = useLanguage();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(() => {
    const f = {};
    if (debouncedSearch) f.search = debouncedSearch;
    if (status !== 'all') f.status = status;
    if (type !== 'all') f.type = type;
    return f;
  }, [debouncedSearch, status, type]);

  const { data: orders = [], isFetching } = useFieldOpsOrders(filters);

  const clear = useCallback(() => { setSearch(''); setStatus('all'); setType('all'); }, []);

  const columns = useMemo(() => [
    {
      accessorKey: 'orderNumber',
      header: t('fieldOps.orders.title', 'Order #'),
      size: 120,
      Cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.orderNumber || row.original._id?.slice(-6)}</span>
      ),
    },
    {
      accessorKey: 'orderType',
      header: language === 'de' ? 'Typ' : 'Type',
      size: 140,
      Cell: ({ row }) => {
        const cfg = ORDER_TYPE_LABELS[row.original.orderType];
        return <span className="text-xs text-muted-foreground">{cfg ? (language === 'de' ? cfg.label : cfg.labelEn) : row.original.orderType}</span>;
      },
    },
    {
      accessorKey: 'customerName',
      header: language === 'de' ? 'Kunde' : 'Customer',
      size: 200,
      Cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.original.customerName || '—'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.original.siteAddress || ''}</p>
        </div>
      ),
    },
    {
      accessorKey: 'assignedTo',
      header: language === 'de' ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => {
        const emp = row.original.assignedEmployee;
        if (!emp) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs">{emp.firstName} {emp.lastName}</span>;
      },
    },
    {
      accessorKey: 'scheduledStart',
      header: language === 'de' ? 'Termin' : 'Scheduled',
      size: 120,
      Cell: ({ row }) => {
        const d = row.original.scheduledStart;
        return d ? <span className="text-xs">{formatDate(d)}</span> : <span className="text-xs text-muted-foreground/60">—</span>;
      },
    },
    {
      accessorKey: 'status',
      header: language === 'de' ? 'Status' : 'Status',
      size: 140,
      Cell: ({ row }) => <FieldOpsOrderStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'reportStatus',
      header: language === 'de' ? 'Bericht' : 'Report',
      size: 130,
      Cell: ({ row }) => {
        const rs = row.original.reportStatus;
        if (!rs) return <span className="text-xs text-muted-foreground/40">—</span>;
        const cfg = REPORT_STATUS_CONFIG[rs];
        return cfg ? (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', cfg.badge)}>
            {language === 'de' ? cfg.label : cfg.labelEn}
          </span>
        ) : <span className="text-xs">{rs}</span>;
      },
    },
  ], [language, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.orders.title', 'Orders')}
        description={t('fieldOps.orders.desc', 'Monitor and manage all technician orders.')}
        count={orders.length}
      />
      <FieldOpsOrderFilters
        search={search} onSearch={(v) => setSearch(v)}
        status={status} onStatus={setStatus}
        type={type} onType={setType}
        onClear={clear}
      />
      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        onRowClick={(row) => router.push(`/field-ops/orders/${row._id}`)}
        emptyMessage={t('fieldOps.orders.empty', 'No orders found.')}
      />
    </div>
  );
}
