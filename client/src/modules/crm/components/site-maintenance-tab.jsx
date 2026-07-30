'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Wrench, CalendarClock, CheckCircle2, Search, ArrowRight,
} from 'lucide-react';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { installationService } from '@/modules/crm/services/installation-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { MaintenanceForm } from './maintenance-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  INSTALLATION_TYPE_META, MAINTENANCE_TYPE_META, MAINTENANCE_STATUS_META,
} from '@/modules/crm/constants/crm-constants';

const siteMaintKey = (siteId) => ['crm', 'maintenance', 'site', siteId];

function componentLabel(inst, t) {
  if (!inst) return t('crm.maintenance.unknownComponent', 'Unbekannte Komponente');
  const meta = INSTALLATION_TYPE_META[inst.type] || INSTALLATION_TYPE_META.other;
  const typeLabel = t(`crm.installations.type.${inst.type}`, meta?.label || inst.type);
  const mm = [inst.manufacturer, inst.model].filter(Boolean).join(' ');
  return mm ? `${typeLabel} · ${mm}` : typeLabel;
}

/**
 * Object-level maintenance (Wartungen). Aggregates the maintenance intervals of
 * every component (Komponente/Installation) of the site, grouped by component.
 * "Neue Wartung" first picks the component, then opens the maintenance form —
 * a maintenance interval always belongs to a component.
 */
export function SiteMaintenanceTab({ siteId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [targetInstallationId, setTargetInstallationId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: siteMaintKey(siteId),
    queryFn: () => maintenanceService.listBySite(siteId),
    enabled: !!siteId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: siteMaintKey(siteId) });
    qc.invalidateQueries({ queryKey: ['crm', 'maintenance'] });
  };

  const createMut = useMutation({
    mutationFn: ({ installationId, data }) => maintenanceService.createForInstallation(installationId, data),
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
  const markMut = useMutation({
    mutationFn: (id) => maintenanceService.update(id, { lastServiceDate: new Date().toISOString(), maintenanceStatus: 'ok' }),
    onSuccess: () => { invalidate(); showSuccess(t('crm.maintenance.markedCompletedToast', 'Als durchgeführt markiert')); },
    onError: (err) => showError(err.message),
  });

  // Group intervals by their owning component.
  const groups = useMemo(() => {
    const map = new Map();
    for (const m of items) {
      const inst = m.installationId;
      const key = inst?._id || inst || 'unknown';
      if (!map.has(key)) map.set(key, { installation: inst, items: [] });
      map.get(key).items.push(m);
    }
    return [...map.values()];
  }, [items]);

  const openNewForComponent = (installationId) => {
    setTargetInstallationId(installationId);
    setEditItem(null);
    setPickerOpen(false);
    setFormOpen(true);
  };

  const handleSubmit = async (data) => {
    if (editItem?._id) await updateMut.mutateAsync({ id: editItem._id, data });
    else if (targetInstallationId) await createMut.mutateAsync({ installationId: targetInstallationId, data });
    setEditItem(null);
    setFormOpen(false);
  };

  if (isLoading) return <MaintenanceSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('crm.maintenance.objectTitle', 'Wartungen')}</h3>
          <span className="text-xs text-muted-foreground">({items.length})</span>
        </div>
        {canWrite && (
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> {t('crm.maintenance.newForObject', 'Neue Wartung')}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t('crm.maintenance.objectEmpty', 'Keine Wartungen')}
          description={t('crm.maintenance.objectEmptyDesc', 'Für die Komponenten dieses Objekts sind noch keine Wartungen erfasst.')}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const inst = g.installation;
            const instId = inst?._id || inst;
            return (
              <Card key={instId}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{componentLabel(inst, t)}</p>
                        {inst?.installationNumber && (
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{inst.installationNumber}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canWrite && (
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => openNewForComponent(instId)}>
                          <Plus className="h-3 w-3" /> {t('crm.maintenance.newInterval', 'Neues Intervall')}
                        </Button>
                      )}
                      {instId && (
                        <IconActionButton label={t('common.open', 'Öffnen')} icon={ArrowRight} href={`/crm/installations/${instId}`} />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {g.items.map((m) => (
                      <MaintenanceRow
                        key={m._id}
                        m={m}
                        canWrite={canWrite}
                        canDelete={canDelete}
                        onEdit={() => { setEditItem(m); setTargetInstallationId(instId); setFormOpen(true); }}
                        onDelete={() => setDeleteTarget(m)}
                        onMark={() => markMut.mutate(m._id)}
                        isMarking={markMut.isPending && markMut.variables === m._id}
                        t={t}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ComponentPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        siteId={siteId}
        onPick={openNewForComponent}
        t={t}
      />

      <MaintenanceForm
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditItem(null); }}
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
    </div>
  );
}

function MaintenanceRow({ m, canWrite, canDelete, onEdit, onDelete, onMark, isMarking, t }) {
  const typeMeta = MAINTENANCE_TYPE_META[m.maintenanceType] || MAINTENANCE_TYPE_META.other;
  const statusMeta = MAINTENANCE_STATUS_META[m.maintenanceStatus] || MAINTENANCE_STATUS_META.ok;
  const Icon = typeMeta.icon;
  const typeLabel = m.maintenanceType === 'other' && m.customTypeLabel
    ? m.customTypeLabel
    : t(`crm.maintenance.type.${m.maintenanceType}`, typeMeta.label);
  const lastService = m.lastServiceDate ? new Date(m.lastServiceDate).toLocaleDateString('de-CH') : '—';
  const nextService = m.nextDueDate ? new Date(m.nextDueDate).toLocaleDateString('de-CH') : '—';

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', typeMeta.bg)}>
          <Icon className={cn('h-4 w-4', typeMeta.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{typeLabel}</p>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', statusMeta.bg, statusMeta.color)}>
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
              <p className="inline-flex items-center gap-1 font-medium"><CalendarClock className="h-2.5 w-2.5" /> {nextService}</p>
            </div>
          </div>
          {m.notes && <p className="mt-2 break-words text-xs text-muted-foreground">{m.notes}</p>}
        </div>
        <div className="flex items-start gap-0.5">
          {canWrite && (
            <IconActionButton label={t('crm.maintenance.markCompleted', 'Als durchgeführt markieren')} icon={CheckCircle2} onClick={onMark} disabled={isMarking} className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600" />
          )}
          {canWrite && <IconActionButton label={t('common.edit', 'Bearbeiten')} icon={Pencil} onClick={onEdit} />}
          {canDelete && <IconActionButton label={t('common.delete', 'Löschen')} icon={Trash2} destructive onClick={onDelete} />}
        </div>
      </div>
    </div>
  );
}

function ComponentPickerDialog({ open, onOpenChange, siteId, onPick, t }) {
  const [search, setSearch] = useState('');
  const { data: installations = [], isLoading } = useQuery({
    queryKey: ['crm', 'installations', 'site', siteId, 'picker'],
    queryFn: () => installationService.listBySite(siteId),
    enabled: open && !!siteId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return installations;
    return installations.filter((i) =>
      [i.installationNumber, i.manufacturer, i.model, i.type].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [installations, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.maintenance.pickComponent', 'Komponente wählen')}</DialogTitle>
          <DialogDescription>{t('crm.maintenance.pickComponentDesc', 'Für welche Komponente soll die Wartung erfasst werden?')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('crm.maintenance.searchComponent', 'Komponente suchen…')} className="pl-9" autoFocus />
        </div>
        <div className="max-h-[320px] space-y-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading', 'Wird geladen…')}</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('crm.maintenance.noComponents', 'Keine Komponenten vorhanden')}</p>
          ) : (
            filtered.map((i) => {
              const meta = INSTALLATION_TYPE_META[i.type] || INSTALLATION_TYPE_META.other;
              const Icon = meta?.icon || Wrench;
              return (
                <button
                  key={i._id}
                  type="button"
                  onClick={() => onPick(i._id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta?.bg)}>
                    <Icon className={cn('h-4 w-4', meta?.color)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{componentLabel(i, t)}</p>
                    {i.installationNumber && <p className="truncate font-mono text-[11px] text-muted-foreground">{i.installationNumber}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MaintenanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}><CardContent className="space-y-2 p-4">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </CardContent></Card>
      ))}
    </div>
  );
}
