'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActivityTimeline } from '@/modules/crm/hooks/use-activity-timeline';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Activity, FileText, Wrench, Clock, AlertTriangle, Info, ChevronRight,
  ShoppingCart, Receipt, Image as ImageIcon, ClipboardList, History,
  ArrowDownUp, Download, Loader2,
} from 'lucide-react';

/**
 * Unified site/installation activity-history timeline.
 *
 * Consumes the server's unified feed at GET /crm/{sites|installations}/:id/activity
 * via the useActivityTimeline infinite-query hook. Supports a type filter,
 * date-range filter, newest↔oldest sort toggle, click-through navigation to the
 * source record, and CSV/PDF export.
 *
 * @param {Object} props
 * @param {'site'|'installation'} props.entityType
 * @param {string} props.entityId
 */
export function HistoryTimeline({ entityType, entityId }) {
  const [type, setType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [order, setOrder] = useState('desc');

  const filters = { type, dateFrom, dateTo, order };

  const {
    items,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    exportMutation,
  } = useActivityTimeline({ entityType, entityId, filters });

  const handleExport = (format) => {
    exportMutation.mutate(
      { format },
      {
        onSuccess: ({ filename }) => showSuccess(`Export erstellt: ${filename}`),
        onError: (err) => showError(err),
      },
    );
  };

  const hasActiveFilters = type !== 'all' || !!dateFrom || !!dateTo;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Historie</h3>
          {!isLoading && (
            <span className="text-xs text-muted-foreground">({items.length}{hasNextPage ? '+' : ''})</span>
          )}
        </div>

        <Toolbar
          type={type}
          onTypeChange={setType}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          order={order}
          onToggleOrder={() => setOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
          onExport={handleExport}
          exporting={exportMutation.isPending}
        />

        {isLoading ? (
          <TimelineSkeleton />
        ) : isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Historie konnte nicht geladen werden"
            description={error?.message}
            action={<Button variant="outline" size="sm" onClick={() => refetch()}>Erneut versuchen</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Keine Historie"
            description={hasActiveFilters
              ? 'Keine Einträge entsprechen den gewählten Filtern.'
              : 'Sobald Wartungen durchgeführt, Notizen erfasst oder Dokumente erstellt werden, erscheinen sie hier.'}
            icon={Activity}
          />
        ) : (
          <>
            <div className="relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
              <div className="space-y-3">
                {items.map((entry) => <TimelineItem key={entry._id} entry={entry} />)}
              </div>
            </div>

            {hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Wird geladen…' : 'Mehr laden'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Alle' },
  { value: 'note', label: 'Notizen' },
  { value: 'image', label: 'Bilder' },
  { value: 'maintenance_done', label: 'Wartung durchgeführt' },
  { value: 'maintenance_scheduled', label: 'Wartung geplant' },
  { value: 'service_order', label: 'Serviceaufträge' },
  { value: 'quotation', label: 'Offerten' },
  { value: 'order', label: 'Aufträge' },
  { value: 'invoice', label: 'Rechnungen' },
  { value: 'audit', label: 'Änderungen' },
];

function Toolbar({
  type, onTypeChange, dateFrom, onDateFromChange, dateTo, onDateToChange,
  order, onToggleOrder, onExport, exporting,
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select value={type} onValueChange={onTypeChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="Typ" />
        </SelectTrigger>
        <SelectContent>
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          aria-label="Von"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="h-8 w-[140px] text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label="Bis"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => onDateToChange(e.target.value)}
          className="h-8 w-[140px] text-xs"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={onToggleOrder}
        title={order === 'desc' ? 'Neueste zuerst' : 'Älteste zuerst'}
      >
        <ArrowDownUp className="h-3.5 w-3.5" />
        {order === 'desc' ? 'Neueste' : 'Älteste'}
      </Button>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onExport('csv')}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onExport('pdf')}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          PDF
        </Button>
      </div>
    </div>
  );
}

function TimelineItem({ entry }) {
  const config = getTypeConfig(entry);
  const Icon = config.icon;
  const date = entry.timestamp ? new Date(entry.timestamp) : null;
  const dateStr = date ? date.toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const timeStr = date ? date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '';
  const isFuture = date && date > new Date();
  const href = resolveLink(entry);
  const metaLine = describeMeta(entry.meta);

  const body = (
    <>
      <div className={cn(
        'relative z-10 h-10 w-10 shrink-0 rounded-full ring-4 ring-card flex items-center justify-center',
        config.bg,
        isFuture && 'ring-dashed',
      )}>
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{entry.title || 'Ereignis'}</p>
          {entry.status && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
              {entry.status}
            </span>
          )}
          {isFuture && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-600">
              Geplant
            </span>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {dateStr}{timeStr && ` · ${timeStr}`}
          </span>
          {href && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </div>
        {entry.summary && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 break-words">
            {entry.summary}
          </p>
        )}
        {(metaLine || entry.actor) && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">
            {metaLine}
            {metaLine && entry.actor && ' · '}
            {entry.actor && `von ${entry.actor}`}
          </p>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="relative flex gap-3 rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-muted/50"
      >
        {body}
      </Link>
    );
  }

  return <div className="relative flex gap-3">{body}</div>;
}

/**
 * Map a timeline entry's `link` (and entry type) to an in-app route.
 * Returns null when no reliable route exists (renders non-clickable).
 *
 * Notes & images live in-context on the current entity (no deep link).
 * QOP documents are managed via dialogs on the consolidated /quotes page —
 * there is no per-document detail route — so they link to /quotes.
 */
function resolveLink(entry) {
  const link = entry?.link;
  if (!link) return null;
  const id = link.entityId;
  const linkType = link.entityType || entry.type;
  const moduleName = link.module;

  switch (linkType) {
    case 'quotation':
    case 'order':
    case 'invoice':
      // QOP documents open in dialogs on /quotes (no standalone detail route).
      return '/quotes';
    case 'service_order':
      return id ? `/field-ops/orders/${id}` : null;
    case 'maintenance_done':
    case 'maintenance_scheduled':
    case 'assignment':
    case 'maintenance':
      // Scheduled/maintenance work surfaces on the scheduling calendar.
      return '/scheduling/calendar';
    default:
      break;
  }

  // Fallback: map by module when entityType wasn't explicit.
  switch (moduleName) {
    case 'qop':
      return '/quotes';
    case 'field-ops':
    case 'mobile':
      return id ? `/field-ops/orders/${id}` : null;
    case 'scheduling':
    case 'deploy':
      return '/scheduling/calendar';
    default:
      return null;
  }
}

/** Build a compact meta line (amount/category) for the secondary row. */
function describeMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const parts = [];
  if (meta.amount != null && meta.currency) {
    parts.push(`${meta.currency} ${Number(meta.amount).toLocaleString('de-CH', { minimumFractionDigits: 2 })}`);
  } else if (meta.amount != null) {
    parts.push(Number(meta.amount).toLocaleString('de-CH', { minimumFractionDigits: 2 }));
  }
  if (meta.category) parts.push(String(meta.category));
  return parts.join(' · ');
}

const TYPE_CONFIG = {
  note: { icon: Info, color: 'text-slate-500', bg: 'bg-slate-500/10' },
  image: { icon: ImageIcon, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  maintenance_done: { icon: Wrench, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  maintenance_scheduled: { icon: Clock, color: 'text-sky-500', bg: 'bg-sky-500/10' },
  service_order: { icon: ClipboardList, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  quotation: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  order: { icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  invoice: { icon: Receipt, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  audit: { icon: History, color: 'text-slate-500', bg: 'bg-slate-500/10' },
};

function getTypeConfig(entry) {
  return TYPE_CONFIG[entry?.type] || { icon: Info, color: 'text-slate-500', bg: 'bg-slate-500/10' };
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5 pt-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
