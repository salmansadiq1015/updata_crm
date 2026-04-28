'use client';

import { useState, useMemo } from 'react';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsReportDetailPanel } from './field-ops-report-detail-panel';
import { REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';

export function FieldOpsReportsTable() {
  const { t, language } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReport, setSelectedReport] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filters = useMemo(() => {
    const f = {};
    if (statusFilter !== 'all') f.reportStatus = statusFilter;
    return f;
  }, [statusFilter]);

  const { data: orders = [], isFetching } = useFieldOpsOrders(filters);

  const reports = useMemo(() => {
    return orders.flatMap((order) =>
      (order.reports || []).map((r) => ({
        ...r,
        _orderId: order._id,
        _orderNumber: order.orderNumber,
        _customerName: order.customerName,
        _technicianName: order.assignedEmployee
          ? `${order.assignedEmployee.firstName} ${order.assignedEmployee.lastName}`
          : '—',
      }))
    );
  }, [orders]);

  const STATUS_OPTS = [
    { value: 'all', de: 'Alle Status', en: 'All Statuses' },
    ...Object.entries(REPORT_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
  ];

  const columns = useMemo(() => [
    {
      accessorKey: '_orderNumber',
      header: language === 'de' ? 'Auftrag' : 'Order',
      size: 110,
      Cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original._orderNumber || '—'}</span>,
    },
    {
      accessorKey: '_technicianName',
      header: language === 'de' ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => <span className="text-sm">{row.original._technicianName}</span>,
    },
    {
      accessorKey: 'reportDate',
      header: language === 'de' ? 'Datum' : 'Date',
      size: 110,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.reportDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 130,
      Cell: ({ row }) => <FieldOpsReportStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'materialItems',
      header: language === 'de' ? 'Material' : 'Materials',
      size: 90,
      Cell: ({ row }) => <span className="text-xs text-muted-foreground">{(row.original.materialItems || []).length}</span>,
    },
  ], [language]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.reports.title', 'Work Reports')}
        description={t('fieldOps.reports.desc', 'Review and approve submitted reports.')}
        count={reports.length}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs rounded-full border-dashed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{language === 'de' ? o.de : o.en}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>
      <DataTableShell
        columns={columns}
        data={reports}
        isLoading={isFetching && reports.length === 0}
        onRowClick={(row) => { setSelectedReport(row); setPanelOpen(true); }}
        emptyMessage={t('fieldOps.reports.empty', 'No reports found.')}
      />
      <FieldOpsReportDetailPanel
        report={selectedReport}
        orderId={selectedReport?._orderId}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedReport(null); }}
      />
    </div>
  );
}
