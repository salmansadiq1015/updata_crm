'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { installationService } from '@/modules/crm/services/installation-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { InstallationForm } from './installation-form';
import { MaintenancePanel } from './maintenance-panel';
import { NotesPanel } from './notes-panel';
import { ImagesPanel } from './images-panel';
import { HistoryTimeline } from './history-timeline';
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
import {
  Pencil, PowerOff, ChevronRight, Wrench, FileText, Image as ImageIcon,
  Calendar, Zap, Hash, ShieldCheck, Thermometer, Loader2, Activity,
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
      showSuccess(t('crm.installations.updatedToast', 'Installation aktualisiert'));
    },
    onError: (err) => showError(err.message),
  });

  const decommMut = useMutation({
    mutationFn: (r) => installationService.decommission(id, r),
    onSuccess: () => {
      showSuccess(t('crm.installations.decommissionedToast', 'Installation ausser Betrieb'));
      if (installation?.siteId) router.push(`/crm/sites/${installation.siteId?._id || installation.siteId}`);
      else router.back();
    },
    onError: (err) => showError(err.message),
  });

  if (isLoading) return <InstallationDetailSkeleton />;
  if (!installation) return <EmptyState title={t('crm.installations.notFound', 'Installation nicht gefunden')} description={t('crm.installations.notFoundDesc', 'Die angeforderte Installation existiert nicht.')} />;

  const meta = INSTALLATION_TYPE_META[installation.type] || INSTALLATION_TYPE_META.other;
  const fuelMeta = installation.fuelType ? FUEL_TYPE_META[installation.fuelType] : null;
  const Icon = meta.icon;
  const isActive = installation.status !== 'decommissioned';
  const siteId = installation.siteId?._id || installation.siteId;
  const siteName = installation.siteId?.name;
  const customerId = installation.siteId?.customerId?._id || installation.siteId?.customerId;
  const customerName = installation.siteId?.customerId?.name;

  const warrantyValid = installation.warrantyEndDate && new Date(installation.warrantyEndDate) > new Date();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/crm/customers" className="hover:text-foreground transition-colors">CRM</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {customerId ? (
          <Link href={`/crm/customers/${customerId}`} className="hover:text-foreground transition-colors truncate max-w-[150px]">
            {customerName || t('crm.customer', 'Kunde')}
          </Link>
        ) : <span>{t('crm.customer', 'Kunde')}</span>}
        <ChevronRight className="h-3.5 w-3.5" />
        {siteId ? (
          <Link href={`/crm/sites/${siteId}`} className="hover:text-foreground transition-colors truncate max-w-[150px]">
            {siteName || t('crm.sites.title', 'Objekt')}
          </Link>
        ) : <span>{t('crm.sites.title', 'Objekt')}</span>}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{t(`crm.installations.type.${installation.type}`, meta.label)}</span>
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-theme-sm">
        <div className="flex items-start gap-4 flex-wrap">
          <div className={cn('h-14 w-14 shrink-0 rounded-xl flex items-center justify-center ring-1', meta.bg, meta.ring)}>
            <Icon className={cn('h-7 w-7', meta.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold tracking-tight">{t(`crm.installations.type.${installation.type}`, meta.label)}</h1>
              {fuelMeta && (
                <span className={cn('inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted', fuelMeta.color)}>
                  <Thermometer className="h-3 w-3 mr-1" /> {t(`crm.installations.fuel.${installation.fuelType}`, fuelMeta.label)}
                </span>
              )}
              {warrantyValid && (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-3 w-3" /> {t('crm.installations.warrantyActive', 'Garantie aktiv')}
                </span>
              )}
              {!isActive && (
                <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {t('crm.installations.decommissioned', 'Ausser Betrieb')}
                </span>
              )}
            </div>

            {(installation.manufacturer || installation.model) && (
              <p className="text-sm text-muted-foreground">
                {[installation.manufacturer, installation.model].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canWrite && isActive && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
              </Button>
            )}
            {canDelete && isActive && (
              <Button variant="outline" size="sm" className="gap-1.5 hover:text-destructive hover:border-destructive/40" onClick={() => setDecommOpen(true)}>
                <PowerOff className="h-3.5 w-3.5" /> {t('crm.installations.decommissionAction', 'Ausser Betrieb')}
              </Button>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            className={warrantyValid ? 'text-emerald-600' : ''}
          />
        </div>

        {installation.technicalNotes && (
          <>
            <Separator className="my-4" />
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wider">{t('crm.installations.technicalNotes', 'Technische Notizen')}</p>
              <p className="text-sm whitespace-pre-wrap">{installation.technicalNotes}</p>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="maintenance" className="space-y-6">
        <TabsList variant="line">
          <TabsTrigger value="maintenance" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> {t('crm.installations.tab.maintenance', 'Wartung')}
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
      />

      <Dialog open={decommOpen} onOpenChange={setDecommOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('crm.installations.decommissionTitle', 'Installation ausser Betrieb nehmen')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">{t('crm.installations.decommissionDesc', 'Die Installation wird als ausser Betrieb markiert.')}</p>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t('crm.installations.decommissionReason', 'Grund')}*</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('crm.installations.decommissionReasonPlaceholder', 'z.B. Ersatzinvestition')} autoFocus />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setDecommOpen(false)} disabled={decommMut.isPending}>{t('common.cancel', 'Abbrechen')}</Button>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value, mono, className }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn('text-sm font-semibold truncate', mono && 'font-mono', className)}>
          {value || <span className="text-muted-foreground/50">—</span>}
        </p>
      </div>
    </div>
  );
}

function InstallationDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-72" />
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex gap-4">
          <Skeleton className="h-14 w-14 rounded-xl" />
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
