'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { noteService } from '@/modules/crm/services/note-service';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Activity, FileText, Wrench, Calendar, AlertTriangle, Clock, Info,
  ShoppingCart, Receipt, CheckCircle, Send, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import {
  MAINTENANCE_TYPE_META, NOTE_CATEGORY_META,
} from '@/modules/crm/constants/crm-constants';

/**
 * Aggregates notes + maintenance events into a unified chronological timeline
 * for a site or installation. Future modules (orders, quotations, invoices) can
 * extend this by adding more queries below — filter pipeline is entity-agnostic.
 *
 * @param {Object} props
 * @param {'site'|'installation'} props.entityType
 * @param {string} props.entityId
 */
export function HistoryTimeline({ entityType, entityId }) {
  const notesKey = entityType === 'site'
    ? queryKeys.crm.notes.bySite(entityId)
    : queryKeys.crm.notes.byInstallation(entityId);

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: notesKey,
    queryFn: () => noteService.listByEntity(entityType, entityId),
    enabled: !!entityId,
  });

  // Maintenance is only relevant for installations
  const { data: maintenance = [], isLoading: loadingMaint } = useQuery({
    queryKey: queryKeys.crm.maintenance.byInstallation(entityId),
    queryFn: () => maintenanceService.listByInstallation(entityId),
    enabled: !!entityId && entityType === 'installation',
  });

  const timeline = useMemo(() => {
    const entries = [];

    for (const n of notes) {
      entries.push({
        id: `note-${n._id}`,
        date: n.createdAt,
        type: 'note',
        category: n.category,
        isWarning: n.isWarning,
        title: NOTE_CATEGORY_META[n.category]?.label || 'Notiz',
        summary: n.text,
        author: n.createdBy?.displayName || n.createdBy?.email,
      });
    }

    for (const m of maintenance) {
      if (m.lastServiceDate) {
        const typeMeta = MAINTENANCE_TYPE_META[m.maintenanceType] || MAINTENANCE_TYPE_META.other;
        const label = m.maintenanceType === 'other' && m.customTypeLabel ? m.customTypeLabel : typeMeta.label;
        entries.push({
          id: `maint-last-${m._id}`,
          date: m.lastServiceDate,
          type: 'maintenance_done',
          title: `${label} durchgeführt`,
          summary: m.notes,
        });
      }
      if (m.nextDueDate && new Date(m.nextDueDate) > new Date()) {
        const typeMeta = MAINTENANCE_TYPE_META[m.maintenanceType] || MAINTENANCE_TYPE_META.other;
        const label = m.maintenanceType === 'other' && m.customTypeLabel ? m.customTypeLabel : typeMeta.label;
        entries.push({
          id: `maint-next-${m._id}`,
          date: m.nextDueDate,
          type: 'maintenance_scheduled',
          title: `${label} geplant`,
          summary: `Alle ${m.frequencyMonths} Monate`,
        });
      }
    }

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    return entries;
  }, [notes, maintenance]);

  const isLoading = loadingNotes || (entityType === 'installation' && loadingMaint);

  if (isLoading) return <TimelineSkeleton />;

  if (timeline.length === 0) {
    return (
      <Card>
        <CardContent className="p-8">
          <EmptyState
            title="Keine Historie"
            description="Sobald Wartungen durchgeführt oder Notizen erfasst werden, erscheinen sie hier."
            icon={Activity}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Historie</h3>
          <span className="text-xs text-muted-foreground">({timeline.length})</span>
        </div>
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />
          <div className="space-y-3">
            {timeline.map((entry) => <TimelineItem key={entry.id} entry={entry} />)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItem({ entry }) {
  const config = getTypeConfig(entry);
  const Icon = config.icon;
  const date = entry.date ? new Date(entry.date) : null;
  const dateStr = date ? date.toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const timeStr = date ? date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '';
  const isFuture = date && date > new Date();

  return (
    <div className="relative flex gap-3">
      <div className={cn(
        'relative z-10 h-10 w-10 shrink-0 rounded-full ring-4 ring-card flex items-center justify-center',
        config.bg,
        isFuture && 'ring-dashed',
      )}>
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{entry.title}</p>
          {entry.isWarning && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600">
              <AlertTriangle className="h-2.5 w-2.5" /> Warnung
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
        </div>
        {entry.summary && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 break-words">
            {entry.summary}
          </p>
        )}
        {entry.author && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/70">von {entry.author}</p>
        )}
      </div>
    </div>
  );
}

function getTypeConfig(entry) {
  if (entry.type === 'note') {
    const meta = NOTE_CATEGORY_META[entry.category] || NOTE_CATEGORY_META.general;
    return { icon: meta.icon, color: meta.color, bg: meta.bg };
  }
  if (entry.type === 'maintenance_done') {
    return { icon: Wrench, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  }
  if (entry.type === 'maintenance_scheduled') {
    return { icon: Clock, color: 'text-sky-500', bg: 'bg-sky-500/10' };
  }
  // QOP entry types
  if (entry.type === 'quotation_created') {
    return { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10' };
  }
  if (entry.type === 'quotation_sent') {
    return { icon: Send, color: 'text-sky-500', bg: 'bg-sky-500/10' };
  }
  if (entry.type === 'quotation_accepted') {
    return { icon: ThumbsUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  }
  if (entry.type === 'quotation_declined') {
    return { icon: ThumbsDown, color: 'text-red-500', bg: 'bg-red-500/10' };
  }
  if (entry.type === 'order_created') {
    return { icon: ShoppingCart, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  }
  if (entry.type === 'invoice_created') {
    return { icon: Receipt, color: 'text-orange-500', bg: 'bg-orange-500/10' };
  }
  if (entry.type === 'invoice_sent') {
    return { icon: Send, color: 'text-sky-500', bg: 'bg-sky-500/10' };
  }
  if (entry.type === 'invoice_paid') {
    return { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  }
  return { icon: Info, color: 'text-slate-500', bg: 'bg-slate-500/10' };
}

function TimelineSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-5 w-24" />
        </div>
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
      </CardContent>
    </Card>
  );
}
