'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { installationService } from '@/modules/crm/services/installation-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { InstallationForm } from './installation-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { PermissionGate } from '@/shared/components/permission-gate';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/shared/components/icon-action-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, PowerOff, Wrench, ArrowRight, Calendar, Zap, Hash, Loader2,
} from 'lucide-react';
import { INSTALLATION_TYPE_META, FUEL_TYPE_META } from '@/modules/crm/constants/crm-constants';

export function InstallationsPanel({ siteId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editInstallation, setEditInstallation] = useState(null);
  const [decommTarget, setDecommTarget] = useState(null);
  const [decommReason, setDecommReason] = useState('');

  const { data: installations = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.installations.bySite(siteId),
    queryFn: () => installationService.listBySite(siteId),
    enabled: !!siteId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.crm.installations.bySite(siteId) });

  const createMut = useMutation({
    mutationFn: (data) => installationService.createForSite(siteId, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.installations.createdToast', 'Installation erstellt')); },
    onError: (err) => showError(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => installationService.update(id, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.installations.updatedToast', 'Installation aktualisiert')); },
    onError: (err) => showError(err.message),
  });
  const decommMut = useMutation({
    mutationFn: ({ id, reason }) => installationService.decommission(id, reason),
    onSuccess: () => {
      invalidate();
      showSuccess(t('crm.installations.decommissionedToast', 'Installation ausser Betrieb'));
      setDecommTarget(null);
      setDecommReason('');
    },
    onError: (err) => showError(err.message),
  });

  const handleSubmit = async (data) => {
    if (editInstallation?._id) await updateMut.mutateAsync({ id: editInstallation._id, data });
    else await createMut.mutateAsync(data);
    setEditInstallation(null);
  };

  if (isLoading) return <InstallationsSkeleton />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.installations.title', 'Installationen')}</h3>
            <span className="text-xs text-muted-foreground">({installations.length})</span>
          </div>
          <PermissionGate permission="crm:write">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditInstallation(null); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5" /> {t('crm.installations.newInstallation', 'Neue Installation')}
            </Button>
          </PermissionGate>
        </div>

        {installations.length === 0 ? (
          <EmptyState title={t('crm.installations.empty', 'Keine Installationen')} description={t('crm.installations.emptyDesc', 'Fügen Sie Heizkessel, Wärmepumpen, etc. hinzu.')} />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {installations.map((i) => (
              <InstallationCard
                key={i._id}
                installation={i}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => { setEditInstallation(i); setFormOpen(true); }}
                onDecommission={() => setDecommTarget(i)}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>

      <InstallationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editInstallation}
        isLoading={createMut.isPending || updateMut.isPending}
      />

      <Dialog open={!!decommTarget} onOpenChange={(v) => !v && setDecommTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('crm.installations.decommissionTitle', 'Installation ausser Betrieb nehmen')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {t('crm.installations.decommissionDescLong', 'Die Installation wird als ausser Betrieb markiert. Dieser Vorgang kann nicht direkt rückgängig gemacht werden.')}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('crm.installations.decommissionReason', 'Grund')}*</Label>
              <Input
                value={decommReason}
                onChange={(e) => setDecommReason(e.target.value)}
                placeholder={t('crm.installations.decommissionReasonPlaceholderLong', 'z.B. Ersatzinvestition, Defekt...')}
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDecommTarget(null)} disabled={decommMut.isPending}>
                {t('common.cancel', 'Abbrechen')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => decommMut.mutate({ id: decommTarget._id, reason: decommReason })}
                disabled={!decommReason.trim() || decommMut.isPending}
                className="gap-2"
              >
                {decommMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('crm.installations.decommissionAction', 'Ausser Betrieb')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InstallationCard({ installation: i, canWrite, canDelete, onEdit, onDecommission, t }) {
  const meta = INSTALLATION_TYPE_META[i.type] || INSTALLATION_TYPE_META.other;
  const Icon = meta.icon;
  const fuelMeta = i.fuelType ? FUEL_TYPE_META[i.fuelType] : null;
  const isActive = i.status !== 'decommissioned';

  return (
    <div className={cn(
      'group/inst relative rounded-xl border bg-card p-3.5 transition-all hover:shadow-theme-sm hover:border-primary/30',
      !isActive && 'opacity-60',
    )}>
      <div className="flex items-start gap-3">
        <div className={cn('h-11 w-11 shrink-0 rounded-lg flex items-center justify-center ring-1', meta.bg, meta.ring)}>
          <Icon className={cn('h-5 w-5', meta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/crm/installations/${i._id}`}
              className="text-sm font-semibold hover:text-primary transition-colors"
            >
              {t(`crm.installations.type.${i.type}`, meta.label)}
            </Link>
            {fuelMeta && (
              <span className={cn('text-[10px] font-medium', fuelMeta.color)}>{t(`crm.installations.fuel.${i.fuelType}`, fuelMeta.label)}</span>
            )}
            {!isActive && (
              <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                {t('crm.installations.decommissioned', 'Ausser Betrieb')}
              </span>
            )}
          </div>

          {(i.manufacturer || i.model) && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {[i.manufacturer, i.model].filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            {i.powerOutputKw != null && (
              <span className="inline-flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" /> {i.powerOutputKw} kW
              </span>
            )}
            {i.yearOfManufacture && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> {i.yearOfManufacture}
              </span>
            )}
            {i.serialNumber && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Hash className="h-2.5 w-2.5" /> {i.serialNumber}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-0.5">
          <IconActionButton label={t('common.open', 'Open')} icon={ArrowRight} href={`/crm/installations/${i._id}`} />
          {canWrite && isActive && (
            <IconActionButton label={t('common.edit', 'Edit')} icon={Pencil} onClick={onEdit} />
          )}
          {canDelete && isActive && (
            <IconActionButton label={t('crm.installations.decommission', 'Decommission')} icon={PowerOff} destructive onClick={onDecommission} />
          )}
        </div>
      </div>
    </div>
  );
}

function InstallationsSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3.5 flex gap-3">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
