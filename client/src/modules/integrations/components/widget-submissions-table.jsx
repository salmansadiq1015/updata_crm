'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { widgetService } from '@/modules/integrations/services/widget-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Search, Filter, X, Settings, ArrowRight,
  Mail, Phone, User as UserIcon, Globe, TrendingUp,
  Clock, CheckCircle2, AlertOctagon,
} from 'lucide-react';
import {
  REQUEST_TYPE_META, PROCESSING_STATUS_META,
} from '@/modules/integrations/constants/widget-constants';

export function WidgetSubmissionsTable() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [cursor, setCursor] = useState(null);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebounce(search, 300);

  const apiParams = useMemo(() => {
    const p = { limit: pageSize };
    if (cursor) p.cursor = cursor;
    if (debouncedSearch) p.contactEmail = debouncedSearch;
    if (statusFilter !== 'all') p.processingStatus = statusFilter;
    if (typeFilter !== 'all') p.requestType = typeFilter;
    return p;
  }, [debouncedSearch, statusFilter, typeFilter, cursor, pageSize]);

  const { data: res, isFetching } = useQuery({
    queryKey: queryKeys.integrations.widget.submissions(apiParams),
    queryFn: () => widgetService.listSubmissions(apiParams),
  });

  const submissions = res?.data ?? [];
  const pagination = res?.pagination ?? {};

  // Summary stats from current page
  const stats = useMemo(() => {
    const total = submissions.length;
    const pending = submissions.filter((s) => s.processingStatus === 'pending').length;
    const processed = submissions.filter((s) => s.processingStatus === 'processed').length;
    const spam = submissions.filter((s) => s.processingStatus === 'spam').length;
    return { total, pending, processed, spam };
  }, [submissions]);

  const hasActiveFilters = !!search || statusFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setCursor(null);
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'contactName',
      header: 'Kontakt',
      size: 260,
      Cell: ({ row }) => {
        const s = row.original;
        return (
          <Link href={`/admin/integrations/widget/submissions/${s._id}`} className="flex items-center gap-3 group min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.contactName}</p>
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {s.referenceNumber || '—'}
              </p>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'requestType',
      header: 'Art',
      size: 160,
      Cell: ({ row }) => {
        const meta = REQUEST_TYPE_META[row.original.requestType] || REQUEST_TYPE_META.other;
        const Icon = meta.icon;
        return (
          <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', meta.bg, meta.color)}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'contactEmail',
      header: 'E-Mail',
      size: 220,
      Cell: ({ row }) => {
        const email = row.original.contactEmail;
        if (!email) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <a
            href={`mailto:${email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs inline-flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            <Mail className="h-3 w-3" /> <span className="truncate">{email}</span>
          </a>
        );
      },
    },
    {
      accessorKey: 'contactPhone',
      header: 'Telefon',
      size: 140,
      Cell: ({ row }) => {
        const phone = row.original.contactPhone;
        if (!phone) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="text-xs inline-flex items-center gap-1.5 hover:text-primary">
            <Phone className="h-3 w-3" /> {phone}
          </a>
        );
      },
    },
    {
      accessorKey: 'processingStatus',
      header: 'Status',
      size: 130,
      Cell: ({ row }) => {
        const meta = PROCESSING_STATUS_META[row.original.processingStatus] || PROCESSING_STATUS_META.pending;
        return (
          <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', meta.bg, meta.color)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
            {meta.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Eingegangen',
      size: 140,
      Cell: ({ row }) => {
        const d = row.original.createdAt ? new Date(row.original.createdAt) : null;
        if (!d) return '—';
        const formatted = d.toLocaleDateString('de-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        return <span className="text-xs text-muted-foreground">{formatted}</span>;
      },
    },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Widget-Anfragen"
        description="Eingegangene Anfragen über das Website-Widget."
        count={pagination.total || submissions.length}
      >
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link href="/admin/integrations/widget/config">
            <Settings className="h-3.5 w-3.5" /> Konfiguration
          </Link>
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Gesamt (Seite)" value={stats.total} icon={Globe} accent="sky" />
        <StatCard label="Offen" value={stats.pending} icon={Clock} accent="amber" />
        <StatCard label="Bearbeitet" value={stats.processed} icon={CheckCircle2} accent="emerald" />
        <StatCard label="Spam" value={stats.spam} icon={AlertOctagon} accent="red" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">Filter</span>
        </div>
        <div className="w-px h-5 bg-border" />

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="E-Mail suchen..."
            className="w-full h-8 pl-9 pr-3 rounded-full border border-border bg-card text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-ring transition-all"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={cn(
            'w-[150px] text-xs rounded-full border-dashed',
            statusFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
          )}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {Object.entries(PROCESSING_STATUS_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>
                <span className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
                  {meta.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            typeFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary',
          )}>
            <SelectValue placeholder="Art" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Arten</SelectItem>
            {Object.entries(REQUEST_TYPE_META).map(([key, meta]) => (
              <SelectItem key={key} value={key}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-border" />
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1 rounded-full hover:text-destructive" onClick={clearFilters}>
              <X className="h-3 w-3" /> Zurücksetzen
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      <DataTableShell
        columns={columns}
        data={submissions}
        isLoading={isFetching && submissions.length === 0}
        rowCount={submissions.length}
        manualPagination
        manualSorting
        manualFiltering
        enableGlobalFilter={false}
        cursorPagination={{
          pageSize,
          onPageSizeChange: setPageSize,
          hasNext: !!pagination.nextCursor,
          hasPrev: !!cursor,
          isFetching,
          onNext: () => setCursor(pagination.nextCursor),
          onPrev: () => setCursor(null),
        }}
        renderRowActions={({ row }) => (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
              <Link href={`/admin/integrations/widget/submissions/${row.original._id}`}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  const themes = {
    sky:     { bg: 'bg-sky-500/10',     color: 'text-sky-600 dark:text-sky-400',        ring: 'ring-sky-500/20' },
    amber:   { bg: 'bg-amber-500/10',   color: 'text-amber-600 dark:text-amber-400',    ring: 'ring-amber-500/20' },
    emerald: { bg: 'bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400',ring: 'ring-emerald-500/20' },
    red:     { bg: 'bg-red-500/10',     color: 'text-red-600 dark:text-red-400',        ring: 'ring-red-500/20' },
  };
  const theme = themes[accent] || themes.sky;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-theme-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={cn('text-3xl font-bold tracking-tight leading-none mt-2', theme.color)}>{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1', theme.bg, theme.ring)}>
          <Icon className={cn('h-5 w-5', theme.color)} />
        </div>
      </div>
    </div>
  );
}
