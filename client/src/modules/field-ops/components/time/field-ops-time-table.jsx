'use client';

import { useState, useMemo } from 'react';
import { useFieldOpsTimeEntries } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsTimeMutations } from '@/modules/field-ops/hooks/use-field-ops-time-mutations';
import { FieldOpsTimeReleaseDialog } from './field-ops-time-release-dialog';
import { FieldOpsTimeOverrideDialog } from './field-ops-time-override-dialog';
import { RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { PermissionGate } from '@/shared/components/permission-gate';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Unlock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FieldOpsTimeTable() {
  const { t, language } = useLanguage();
  const [rowSelection, setRowSelection] = useState({});
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null);

  const { data: entries = [], isFetching } = useFieldOpsTimeEntries({});

  const { releaseBatch, override } = useFieldOpsTimeMutations({
    onRelease: () => { setRowSelection({}); setReleaseOpen(false); },
    onOverride: () => setOverrideTarget(null),
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => {
    const e = entries.find((x) => x._id === id);
    return e && e.releaseStatus === 'PENDING';
  });

  const columns = useMemo(() => [
    {
      accessorKey: 'date',
      header: language === 'de' ? 'Datum' : 'Date',
      size: 110,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'activityType',
      header: language === 'de' ? 'Tätigkeit' : 'Activity',
      size: 130,
      Cell: ({ row }) => {
        const cfg = ACTIVITY_TYPE_LABELS[row.original.activityType];
        return (
          <span className="text-xs text-muted-foreground">
            {cfg ? (language === 'de' ? cfg.label : cfg.labelEn) : row.original.activityType}
          </span>
        );
      },
    },
    {
      accessorKey: 'netDurationMin',
      header: language === 'de' ? 'Netto' : 'Net',
      size: 90,
      Cell: ({ row }) => {
        const min = row.original.netDurationMin || row.original.net_duration_min || 0;
        const h = Math.floor(min / 60);
        const m = min % 60;
        return <span className="text-xs font-mono">{h}h {m > 0 ? `${m}m` : ''}</span>;
      },
    },
    {
      accessorKey: 'releaseStatus',
      header: language === 'de' ? 'Freigabe' : 'Release',
      size: 120,
      Cell: ({ row }) => {
        const cfg = RELEASE_STATUS_CONFIG[row.original.releaseStatus];
        return cfg ? (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', cfg.badge)}>
            {language === 'de' ? cfg.label : cfg.labelEn}
          </span>
        ) : <span className="text-xs">{row.original.releaseStatus}</span>;
      },
    },
    {
      accessorKey: 'note',
      header: language === 'de' ? 'Notiz' : 'Note',
      size: 200,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground truncate">{row.original.note || '—'}</span>
      ),
    },
  ], [language]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.time.title', 'Time Entries')}
        description={t('fieldOps.time.desc', 'Release and manage time entries.')}
        count={entries.length}
      />
      <DataTableShell
        columns={columns}
        data={entries}
        isLoading={isFetching && entries.length === 0}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row._id}
        emptyMessage={t('fieldOps.time.empty', 'No time entries found.')}
        renderRowActions={({ row }) => {
          const isPending = row.original.releaseStatus === 'PENDING';
          const isLocked = row.original.releaseStatus === 'LOCKED';
          if (!isPending && !isLocked) return null;
          return (
            <div className="flex items-center gap-1">
              {isPending && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => releaseBatch.mutate([row.original._id])}
                  disabled={releaseBatch.isPending}
                >
                  <Unlock className="h-3.5 w-3.5 mr-1" />
                  {t('fieldOps.time.release', 'Release')}
                </Button>
              )}
              {isLocked && (
                <PermissionGate permission="time:release:override">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                    onClick={() => setOverrideTarget(row.original._id)}
                    disabled={override.isPending}
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                    {t('fieldOps.time.overrideRelease', 'Override')}
                  </Button>
                </PermissionGate>
              )}
            </div>
          );
        }}
      />

      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button size="sm" onClick={() => setReleaseOpen(true)} disabled={releaseBatch.isPending}>
          <Unlock className="h-3.5 w-3.5 mr-1.5" />
          {t('fieldOps.time.releaseSelected', 'Release Selected')}
        </Button>
      </BulkActionsBar>

      <FieldOpsTimeReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        count={selectedIds.length}
        onConfirm={() => releaseBatch.mutate(selectedIds)}
        isLoading={releaseBatch.isPending}
      />
      <FieldOpsTimeOverrideDialog
        open={!!overrideTarget}
        onOpenChange={(v) => { if (!v) setOverrideTarget(null); }}
        onConfirm={() => override.mutate(overrideTarget)}
        isLoading={override.isPending}
      />
    </div>
  );
}
