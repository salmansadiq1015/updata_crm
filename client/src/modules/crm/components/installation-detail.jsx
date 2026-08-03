'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { installationService } from '@/modules/crm/services/installation-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { InstallationForm } from './installation-form';
import { MaintenancePanel } from './maintenance-panel';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { NotesPanel } from './notes-panel';
import { ImagesPanel } from './images-panel';
import { HistoryTimeline } from './history-timeline';
import { InstallationSparePartsPanel } from './installation-spare-parts-panel';
import { EmptyState } from '@/shared/components/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useBreadcrumbTrail } from '@/stores/breadcrumb-store';
import Link from 'next/link';
import {
  Pencil, PowerOff, Wrench, FileText, Image as ImageIcon,
  Calendar, Zap, Hash, ShieldCheck, Thermometer, Loader2, Activity, Flame, Package,
  Building2, MapPin, Star,
} from 'lucide-react';
import {
  INSTALLATION_TYPE_META, FUEL_TYPE_META,
} from '@/modules/crm/constants/crm-constants';

export function InstallationDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [decommOpen, setDecommOpen] = useState(false);
  const [reason, setReason] = useState('');

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const { data: installation, isLoading } = useQuery({
    queryKey: queryKeys.crm.installations.detail(id),
    queryFn: () => installationService.getById(id),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: (data) => installationService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.installations.detail(id) });
      showSuccess(t('crm.installations.updatedToast', 'Komponente aktualisiert'));
    },
    onError: (err) => showError(err.message),
  });

  const decommMut = useMutation({
    mutationFn: (r) => installationService.decommission(id, r),
    onSuccess: () => {
      showSuccess(t('crm.installations.decommissionedToast', 'Komponente ausser Betrieb'));
      if (installation?.siteId) router.push(`/crm/sites/${installation.siteId?._id || installation.siteId}`);
      else router.back();
    },
    onError: (err) => showError(err.message),
  });

  // The URL (/crm/installations/:id) has no parent chain — publish
  // Kunde › Objekt › Anlage so the header breadcrumb keeps those links.
  useBreadcrumbTrail(id, [
    ...(installation?.siteId?.customerId
      ? [{
          label: installation.siteId.customerId?.name || '',
          path: `/crm/customers/${installation.siteId.customerId?._id || installation.siteId.customerId}`,
        }]
      : []),
    ...(installation?.siteId
      ? [{
          label: installation.siteId?.name || '',
          path: `/crm/sites/${installation.siteId?._id || installation.siteId}`,
        }]
      : []),
    { label: installation ? t(`crm.installations.type.${installation.type}`, installation.type || '') : '' },
  ]);

  if (isLoading) return <InstallationDetailSkeleton />;
  if (!installation) return <EmptyState title={t('crm.installations.notFound', 'Komponente nicht gefunden')} description={t('crm.installations.notFoundDesc', 'Die angeforderte Komponente existiert nicht.')} />;

  const meta = INSTALLATION_TYPE_META[installation.type] || INSTALLATION_TYPE_META.other;
  const fuelMeta = installation.fuelType ? FUEL_TYPE_META[installation.fuelType] : null;
  const Icon = meta.icon;
  const isActive = installation.status !== 'decommissioned';
  const siteId = installation.siteId?._id || installation.siteId;
  const siteName = installation.siteId?.name;
  const customerId = installation.siteId?.customerId?._id || installation.siteId?.customerId;
  const customerName = installation.siteId?.customerId?.name;

  const warrantyValid = installation.warrantyEndDate && new Date(installation.warrantyEndDate) > new Date();

  // All supplied objects: primary first, then the additional ones (populated
  // by the API). Shown whenever the component supplies more than one object.
  const additionalSites = (installation.additionalSiteIds || []).filter((s) => s && s._id);
  const suppliesMultiple = additionalSites.length > 0;

  return (
    <div className="space-y-6">

      {/* Hero Header card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
        {/* Emerald accent stripe for installations */}
        <div className="h-1 w-full bg-linear-to-r from-emerald-500 via-emerald-400 to-transparent" />
        <div className="p-6 flex items-start gap-4 flex-wrap">
          <div className={cn('h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center ring-1 ring-emerald-500/20', meta.bg)}>
            <Icon className={cn('h-7 w-7', meta.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">{t(`crm.installations.type.${installation.type}`, meta.label)}</h1>
              {fuelMeta && (
                <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted/60', fuelMeta.color)}>
                  <Thermometer className="h-3 w-3 mr-1" /> {t(`crm.installations.fuel.${installation.fuelType}`, fuelMeta.label)}
                </span>
              )}
              {warrantyValid && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> {t('crm.installations.warrantyActive', 'Garantie aktiv')}
                </span>
              )}
              {!isActive && (
                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                  {t('crm.installations.decommissioned', 'Ausser Betrieb')}
                </span>
              )}
              {suppliesMultiple && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700 dark:text-brand-300">
                  <Building2 className="h-3 w-3" />
                  {t('crm.installations.suppliesCount', 'Versorgt {count} Objekte', { count: additionalSites.length + 1 })}
                </span>
              )}
            </div>

            {(installation.manufacturer || installation.model) && (
              <p className="text-[13px] text-muted-foreground">
                {[installation.manufacturer, installation.model].filter(Boolean).join(' - ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canWrite && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border bg-muted/50 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                onClick={() => setFormOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
              </Button>
            )}
            {canDelete && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border bg-muted/50 text-muted-foreground hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => setDecommOpen(true)}
              >
                <PowerOff className="h-3.5 w-3.5" /> {t('crm.installations.decommissionAction', 'Ausser Betrieb')}
              </Button>
            )}
          </div>
        </div>

        <Separator className="mx-6 bg-border" />

        {/* Info grid */}
        <div className="p-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile icon={Hash} label={t('crm.installations.serialNumber', 'Seriennummer')} value={installation.serialNumber} mono />
          <InfoTile icon={Zap} label={t('crm.installations.powerOutput', 'Leistung')} value={installation.powerOutputKw ? `${installation.powerOutputKw} kW` : null} />
          <InfoTile icon={Calendar} label={t('crm.installations.yearOfManufacture', 'Baujahr')} value={installation.yearOfManufacture} />
          <InfoTile
            icon={Calendar}
            label={t('crm.installations.commissioningDate', 'Inbetriebnahme')}
            value={installation.commissioningDate ? new Date(installation.commissioningDate).toLocaleDateString('de-CH') : null}
          />
          <InfoTile
            icon={ShieldCheck}
            label={t('crm.installations.warrantyEndDate', 'Garantie bis')}
            value={installation.warrantyEndDate ? new Date(installation.warrantyEndDate).toLocaleDateString('de-CH') : null}
            className={warrantyValid ? 'text-emerald-700 dark:text-emerald-400' : ''}
          />
        </div>

        {/* Versorgt / Zugewiesen — every object this component supplies, with
            direct navigation (client requirement for shared components). */}
        {suppliesMultiple && (
          <div className="px-6 pb-6">
            <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
              <p className="text-[11px] font-semibold mb-3 text-brand-700 dark:text-brand-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {t('crm.installations.suppliedObjects', 'Versorgt / Zugewiesen {count} Objekte', { count: additionalSites.length + 1 })}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { site: installation.siteId, primary: true },
                  ...additionalSites.map((site) => ({ site, primary: false })),
                ].map(({ site, primary }) => site && (
                  <Link
                    key={site._id || 'primary'}
                    href={`/crm/sites/${site._id}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-600 dark:group-hover:text-brand-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">{site.name}</span>
                      {(site.street || site.city) && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[site.street, [site.postalCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </span>
                    {primary && (
                      <span className="ml-auto inline-flex items-center gap-1 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Star className="h-2.5 w-2.5" /> {t('crm.installations.primaryObject', 'Hauptobjekt')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {installation.technicalNotes && (
          <div className="px-6 pb-6">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[11px] font-semibold mb-2 text-muted-foreground/80 uppercase tracking-wider">{t('crm.installations.technicalNotes', 'Technische Notizen')}</p>
              <RichTextContent html={installation.technicalNotes} className="text-[13px] text-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="maintenance" className="space-y-6">
        <TabsList variant="line">
          <TabsTrigger value="maintenance" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> {t('crm.installations.tab.maintenance', 'Wartung')}
          </TabsTrigger>
          <TabsTrigger value="spareParts" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> {t('crm.installations.tab.spareParts', 'Ersatzteile')}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t('crm.installations.tab.notes', 'Notizen')}
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> {t('crm.installations.tab.images', 'Bilder')}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> {t('crm.installations.tab.history', 'Historie')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance">
          <MaintenancePanel installationId={id} />
        </TabsContent>
        <TabsContent value="spareParts">
          <InstallationSparePartsPanel installationId={id} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel entityType="installation" entityId={id} />
        </TabsContent>
        <TabsContent value="images">
          <ImagesPanel entityType="installation" entityId={id} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTimeline entityType="installation" entityId={id} />
        </TabsContent>
      </Tabs>

      <InstallationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(data) => updateMut.mutateAsync(data)}
        defaultValues={installation}
        isLoading={updateMut.isPending}
        customerId={customerId}
        primarySiteId={siteId}
      />

      {/* Decommission dialog */}
      <Dialog open={decommOpen} onOpenChange={setDecommOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col rounded-2xl border border-border bg-card shadow-2xl">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 shrink-0">
                <PowerOff className="h-5 w-5 text-red-400" />
              </div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {t('crm.installations.decommissionTitle', 'Komponente ausser Betrieb nehmen')}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">{t('crm.installations.decommissionDesc', 'Die Komponente wird als ausser Betrieb markiert.')}</p>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-muted-foreground block">
                {t('crm.installations.decommissionReason', 'Grund')} <span className="text-red-400">*</span>
              </Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('crm.installations.decommissionReasonPlaceholder', 'z.B. Ersatzinvestition')}
                autoFocus
                className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-red-500/50 focus-visible:ring-red-500/20"
              />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setDecommOpen(false)}
              disabled={decommMut.isPending}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => decommMut.mutate(reason)}
              disabled={!reason.trim() || decommMut.isPending}
              className="gap-2"
            >
              {decommMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('common.confirmAction', 'Bestätigen')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value, mono, className }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/80 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider">{label}</p>
        <p className={cn('text-[13px] font-semibold text-foreground truncate', mono && 'font-mono', className)}>
          {value || <span className="text-muted-foreground/60">—</span>}
        </p>
      </div>
    </div>
  );
}

function InstallationDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-72" />
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="h-1 bg-emerald-500/40 w-full" />
        <div className="p-6 flex gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
