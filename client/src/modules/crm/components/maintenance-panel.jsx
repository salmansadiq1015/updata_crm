'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { MaintenanceForm } from './maintenance-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, Wrench, CalendarClock, CheckCircle2,
} from 'lucide-react';
import {
  MAINTENANCE_TYPE_META, MAINTENANCE_STATUS_META,
} from '@/modules/crm/constants/crm-constants';

export function MaintenancePanel({ installationId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.maintenance.byInstallation(installationId),
    queryFn: () => maintenanceService.listByInstallation(installationId),
    enabled: !!installationId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.crm.maintenance.byInstallation(installationId) });
    qc.invalidateQueries({ queryKey: queryKeys.crm.maintenance.dashboard() });
  };

  const createMut = useMutation({
    mutationFn: (data) => maintenanceService.createForInstallation(installationId, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.maintenance.createdToast', 'Wartung erstellt')); },
    onError: (err) => showError(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => maintenanceService.update(id, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.maintenance.updatedToast', 'Wartung aktualisiert')); },
    onError: (err) => showError(err.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => maintenanceService.delete(id),
    onSuccess: () => { invalidate(); showSuccess(t('crm.maintenance.deletedToast', 'Wartung gelöscht')); setDeleteTarget(null); },
    onError: (err) => showError(err.message),
  });

  const markCompletedMut = useMutation({
    mutationFn: ({ id }) => maintenanceService.update(id, {
      lastServiceDate: new Date().toISOString(),
      maintenanceStatus: 'ok',
    }),
    onSuccess: () => { invalidate(); showSuccess(t('crm.maintenance.markedCompletedToast', 'Als durchgeführt markiert')); },
    onError: (err) => showError(err.message),
  });

  const handleSubmit = async (data) => {
    if (editItem?._id) await updateMut.mutateAsync({ id: editItem._id, data });
    else await createMut.mutateAsync(data);
    setEditItem(null);
  };

  if (isLoading) return <MaintenanceSkeleton />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.maintenance.intervalsTitle', 'Wartungsintervalle')}</h3>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <PermissionGate permission="crm:write">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditItem(null); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> {t('crm.maintenance.newInterval', 'Neues Intervall')}
            </Button>
          </PermissionGate>
        </div>

        {items.length === 0 ? (
          <EmptyState title={t('crm.maintenance.empty', 'Keine Wartungsintervalle')} description={t('crm.maintenance.emptyDesc', 'Legen Sie Wartungszyklen fest (z.B. jährlicher Service).')} />
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <MaintenanceRow
                key={m._id}
                item={m}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => { setEditItem(m); setFormOpen(true); }}
                onDelete={() => setDeleteTarget(m)}
                onMarkCompleted={() => markCompletedMut.mutate({ id: m._id })}
                isMarking={markCompletedMut.isPending && markCompletedMut.variables?.id === m._id}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>

      <MaintenanceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editItem}
        isLoading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={t('crm.maintenance.confirmDelete', 'Wartung löschen?')}
        description={t('crm.maintenance.deleteDesc', 'Das Wartungsintervall wird gelöscht.')}
        onConfirm={() => deleteMut.mutate(deleteTarget._id)}
        loading={deleteMut.isPending}
        confirmText={t('common.delete', 'Löschen')}
        variant="destructive"
      />
    </Card>
  );
}

function MaintenanceRow({ item: m, canWrite, canDelete, onEdit, onDelete, onMarkCompleted, isMarking, t }) {
  const typeMeta = MAINTENANCE_TYPE_META[m.maintenanceType] || MAINTENANCE_TYPE_META.other;
  const statusMeta = MAINTENANCE_STATUS_META[m.maintenanceStatus] || MAINTENANCE_STATUS_META.ok;
  const Icon = typeMeta.icon;
  const typeLabel = m.maintenanceType === 'other' && m.customTypeLabel
    ? m.customTypeLabel
    : t(`crm.maintenance.type.${m.maintenanceType}`, typeMeta.label);

  const lastService = m.lastServiceDate ? new Date(m.lastServiceDate).toLocaleDateString('de-CH') : '—';
  const nextService = m.nextDueDate ? new Date(m.nextDueDate).toLocaleDateString('de-CH') : '—';

  return (
    <div className="group/maint relative rounded-xl border border-border bg-card p-3.5 hover:shadow-theme-sm transition-all">
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 shrink-0 rounded-lg flex items-center justify-center', typeMeta.bg)}>
          <Icon className={cn('h-4 w-4', typeMeta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold">{typeLabel}</p>
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full', statusMeta.bg, statusMeta.color)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', statusMeta.dot)} />
              {t(`crm.maintenance.status.${m.maintenanceStatus}`, statusMeta.label)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div>
              <p className="text-muted-foreground">{t('crm.maintenance.frequencyMonths', 'Intervall')}</p>
              <p className="font-medium">{t('crm.maintenance.frequencyShort', '{months} Monate', { months: m.frequencyMonths })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('crm.maintenance.lastServiceDate', 'Letzter Service')}</p>
              <p className="font-medium">{lastService}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('crm.maintenance.nextServiceDate', 'Nächster Service')}</p>
              <p className="font-medium inline-flex items-center gap-1">
                <CalendarClock className="h-2.5 w-2.5" /> {nextService}
              </p>
            </div>
          </div>

          {m.notes && (
            <p className="mt-2 text-xs text-muted-foreground break-words">{m.notes}</p>
          )}
        </div>

        <div className="flex items-start gap-0.5">
          {canWrite && (
            <IconActionButton
              label={t('crm.maintenance.markCompleted', 'Mark as completed today')}
              icon={CheckCircle2}
              onClick={onMarkCompleted}
              disabled={isMarking}
              className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600"
            />
          )}
          {canWrite && (
            <IconActionButton label={t('common.edit', 'Edit')} icon={Pencil} onClick={onEdit} />
          )}
          {canDelete && (
            <IconActionButton label={t('common.delete', 'Delete')} icon={Trash2} destructive onClick={onDelete} />
          )}
        </div>
      </div>
    </div>
  );
}

function MaintenanceSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-36" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3.5 flex gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
