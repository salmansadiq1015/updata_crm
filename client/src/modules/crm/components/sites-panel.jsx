'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siteService } from '@/modules/crm/services/site-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { SiteForm } from './site-form';
import { SitesMap } from './sites-map';
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
  Plus, Pencil, Archive, Building2, MapPin, ClipboardList,
  ArrowRight, Key, List, Map,
} from 'lucide-react';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';

export function SitesPanel({ customerId }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const [formOpen, setFormOpen] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [view, setView] = useState('list');

  const { data: sites = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(customerId),
    queryFn: () => siteService.listByCustomer(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.crm.sites.byCustomer(customerId) });

  const createMut = useMutation({
    mutationFn: (data) => siteService.createForCustomer(customerId, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.sites.createdToast', 'Objekt erstellt')); },
    onError: (err) => showError(err.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => siteService.update(id, data),
    onSuccess: () => { invalidate(); showSuccess(t('crm.sites.updatedToast', 'Objekt aktualisiert')); },
    onError: (err) => showError(err.message),
  });
  const deactivateMut = useMutation({
    mutationFn: (id) => siteService.deactivate(id),
    onSuccess: () => { invalidate(); showSuccess(t('crm.sites.deactivatedToast', 'Objekt deaktiviert')); setDeactivateTarget(null); },
    onError: (err) => showError(err.message),
  });

  const handleSubmit = async (data) => {
    if (editSite?._id) await updateMut.mutateAsync({ id: editSite._id, data });
    else await createMut.mutateAsync(data);
    setEditSite(null);
  };

  if (isLoading) return <SitesSkeleton />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{t('crm.sites.titlePlural', 'Objekte & Standorte')}</h3>
            <span className="text-xs text-muted-foreground">({sites.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {sites.length > 0 && (
              <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  aria-pressed={view === 'list'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    view === 'list'
                      ? 'bg-background text-foreground shadow-theme-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  {t('crm.sites.viewList', 'Liste')}
                </button>
                <button
                  type="button"
                  onClick={() => setView('map')}
                  aria-pressed={view === 'map'}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    view === 'map'
                      ? 'bg-background text-foreground shadow-theme-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Map className="h-3.5 w-3.5" />
                  {t('crm.sites.viewMap', 'Karte')}
                </button>
              </div>
            )}
            <PermissionGate permission="crm:write">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditSite(null); setFormOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> {t('crm.sites.newSite', 'Neues Objekt')}
              </Button>
            </PermissionGate>
          </div>
        </div>

        {sites.length === 0 ? (
          <EmptyState
            title={t('crm.sites.empty', 'Keine Objekte')}
            description={t('crm.sites.emptyDesc', 'Fügen Sie Gebäude oder Standorte für diesen Kunden hinzu.')}
          />
        ) : view === 'map' ? (
          <SitesMap sites={sites} />
        ) : (
          <div className="space-y-2">
            {sites.map((s) => (
              <SiteRow
                key={s._id}
                site={s}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => { setEditSite(s); setFormOpen(true); }}
                onDeactivate={() => setDeactivateTarget(s)}
                t={t}
              />
            ))}
          </div>
        )}
      </CardContent>

      <SiteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editSite}
        isLoading={createMut.isPending || updateMut.isPending}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(v) => !v && setDeactivateTarget(null)}
        title={t('crm.sites.confirmDeactivate', 'Objekt deaktivieren?')}
        description={t('crm.sites.deactivateDesc', 'Möchten Sie das Objekt "{name}" wirklich deaktivieren?', { name: deactivateTarget?.name || '' })}
        onConfirm={() => deactivateMut.mutate(deactivateTarget._id)}
        loading={deactivateMut.isPending}
        confirmText={t('crm.sites.deactivate', 'Deaktivieren')}
        variant="destructive"
      />
    </Card>
  );
}

function SiteRow({ site: s, canWrite, canDelete, onEdit, onDeactivate, t }) {
  const typeMeta = SITE_TYPE_META[s.siteType] || SITE_TYPE_META.residential;
  const isActive = s.status !== 'inactive';
  const addressLine = [s.street, [s.postalCode, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <div className={cn(
      'group/site relative rounded-xl border bg-card p-3.5 transition-all hover:shadow-theme-sm hover:border-primary/30',
      !isActive && 'opacity-60',
    )}>
      <div className="flex items-start gap-3">
        <div className={cn('h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ring-1', typeMeta.bg, 'ring-border')}>
          <Building2 className={cn('h-5 w-5', typeMeta.color)} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/crm/sites/${s._id}`}
              className="text-sm font-semibold hover:text-primary transition-colors truncate"
            >
              {s.name}
            </Link>
            <span className={cn('inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full', typeMeta.bg, typeMeta.color)}>
              {t(`crm.sites.type.${s.siteType}`, typeMeta.label)}
            </span>
            {!isActive && (
              <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t('crm.sites.statusInactive', 'Inaktiv')}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {addressLine && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                {addressLine}
              </span>
            )}
            {s.floorUnit && <span>· {s.floorUnit}</span>}
            {s.accessInstructions && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Key className="h-3 w-3" /> {t('crm.sites.accessInstructions', 'Zugang')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {canWrite && isActive && (
            <IconActionButton label={t('common.edit', 'Edit')} icon={Pencil} onClick={onEdit} />
          )}
          {canDelete && isActive && (
            <IconActionButton label={t('crm.sites.deactivate', 'Deactivate')} icon={Archive} destructive onClick={onDeactivate} />
          )}
          <IconActionButton label={t('common.open', 'Open')} icon={ArrowRight} href={`/crm/sites/${s._id}`} />
        </div>
      </div>
    </div>
  );
}

function SitesSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-32" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
