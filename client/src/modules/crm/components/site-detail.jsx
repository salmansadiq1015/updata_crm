'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siteService } from '@/modules/crm/services/site-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { SiteForm } from './site-form';
import { InstallationsPanel } from './installations-panel';
import { NotesPanel } from './notes-panel';
import { ImagesPanel } from './images-panel';
import { HistoryTimeline } from './history-timeline';
import { SiteMapCard } from './site-map-card';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Pencil, Archive, Building2, MapPin, Key, Home,
  ChevronRight, Wrench, FileText, Image as ImageIcon, Activity,
} from 'lucide-react';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

export function SiteDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  const { data: site, isLoading } = useQuery({
    queryKey: queryKeys.crm.sites.detail(id),
    queryFn: () => siteService.getById(id),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: (data) => siteService.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.sites.detail(id) });
      if (site?.customerId) qc.invalidateQueries({ queryKey: queryKeys.crm.sites.byCustomer(site.customerId) });
      showSuccess(t('crm.sites.updatedToast', 'Objekt aktualisiert'));
    },
    onError: (err) => showError(err.message),
  });

  const deactivateMut = useMutation({
    mutationFn: () => siteService.deactivate(id),
    onSuccess: () => {
      showSuccess(t('crm.sites.deactivatedToast', 'Objekt deaktiviert'));
      if (site?.customerId) {
        qc.invalidateQueries({ queryKey: queryKeys.crm.sites.byCustomer(site.customerId) });
        router.push(`/crm/customers/${site.customerId}`);
      } else {
        router.push('/crm/customers');
      }
    },
    onError: (err) => showError(err.message),
  });

  if (isLoading) return <SiteDetailSkeleton />;
  if (!site) return <EmptyState title={t('crm.sites.notFound', 'Objekt nicht gefunden')} description={t('crm.sites.notFoundDesc', 'Das angeforderte Objekt existiert nicht.')} />;

  const typeMeta = SITE_TYPE_META[site.siteType] || SITE_TYPE_META.residential;
  const isActive = site.status !== 'inactive';
  const customerId = site.customerId?._id || site.customerId;
  const customerName = site.customerId?.name;

  const addressLine = [
    site.street,
    [site.postalCode, site.city].filter(Boolean).join(' '),
    site.canton ? cantonName(site.canton) : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-white/35">
        <Link href="/crm/customers" className="hover:text-white/65 transition-colors">CRM</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {customerId ? (
          <Link href={`/crm/customers/${customerId}`} className="hover:text-white/65 transition-colors truncate max-w-[200px]">
            {customerName || t('crm.customer', 'Kunde')}
          </Link>
        ) : (
          <span>{t('crm.customer', 'Kunde')}</span>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-white/70 font-medium truncate">{site.name}</span>
      </nav>

      {/* Hero Header card */}
      <div className="rounded-2xl border border-white/7 bg-[#0D1117] overflow-hidden mb-6">
        {/* Amber accent stripe for site/object */}
        <div className="h-1 w-full bg-linear-to-r from-amber-500 via-amber-400 to-transparent" />
        <div className="p-6 flex items-start gap-4 flex-wrap">
          <div className={cn('h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center ring-1 ring-amber-500/20', typeMeta.bg)}>
            <Building2 className={cn('h-7 w-7', typeMeta.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-[22px] font-bold text-white/90 tracking-tight">{site.name}</h1>
              <span className={cn('inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full', typeMeta.bg, typeMeta.color)}>
                {t(`crm.sites.type.${site.siteType}`, typeMeta.label)}
              </span>
              {!isActive && (
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-white/5 text-white/40">
                  {t('crm.sites.statusInactive', 'Inaktiv')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-[13px] text-white/45 flex-wrap">
              {addressLine && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {addressLine}
                </span>
              )}
              {site.floorUnit && (
                <span className="inline-flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" /> {site.floorUnit}
                </span>
              )}
              {site.accessInstructions && (
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <Key className="h-3.5 w-3.5" /> {t('crm.sites.accessInfoBadge', 'Zugangsinfos vorhanden')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canWrite && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-white/10 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white/80"
                onClick={() => setFormOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
              </Button>
            )}
            {canDelete && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-white/10 bg-white/4 text-white/60 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => setDeactivateOpen(true)}
              >
                <Archive className="h-3.5 w-3.5" /> {t('crm.sites.deactivate', 'Deaktivieren')}
              </Button>
            )}
          </div>
        </div>

        {site.accessInstructions && (
          <div className="px-6 pb-5">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
                <Key className="h-3.5 w-3.5" /> {t('crm.sites.accessInstructions', 'Zugangsinformationen')}
              </div>
              <p className="text-[13px] text-white/70 whitespace-pre-wrap">{site.accessInstructions}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="installations" className="space-y-6">
        <TabsList variant="line">
          <TabsTrigger value="installations" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> {t('crm.installations.title', 'Installationen')}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {t('crm.notes.title', 'Notizen')}
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" /> {t('crm.images.title', 'Bilder')}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> {t('crm.installations.tab.history', 'Historie')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installations">
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <InstallationsPanel siteId={id} />
            <div className="space-y-4">
              <SiteMapCard site={site} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel entityType="site" entityId={id} />
        </TabsContent>
        <TabsContent value="images">
          <ImagesPanel entityType="site" entityId={id} />
        </TabsContent>
        <TabsContent value="activity">
          <HistoryTimeline entityType="site" entityId={id} />
        </TabsContent>
      </Tabs>

      <SiteForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(data) => updateMut.mutateAsync(data)}
        defaultValues={site}
        isLoading={updateMut.isPending}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={t('crm.sites.confirmDeactivate', 'Objekt deaktivieren?')}
        description={t('crm.sites.deactivateDesc', 'Möchten Sie das Objekt "{name}" wirklich deaktivieren?', { name: site.name })}
        onConfirm={() => deactivateMut.mutate()}
        loading={deactivateMut.isPending}
        confirmText={t('crm.sites.deactivate', 'Deaktivieren')}
        variant="destructive"
      />
    </div>
  );
}

function SiteDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-64" />
      <div className="rounded-2xl border border-white/7 bg-[#0D1117] overflow-hidden">
        <div className="h-1 bg-amber-500/40 w-full" />
        <div className="p-6 flex gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
        </div>
      </div>
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
