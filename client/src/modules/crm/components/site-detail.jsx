'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siteService } from '@/modules/crm/services/site-service';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { SiteForm } from './site-form';
import { InstallationsPanel } from './installations-panel';
import { NotesPanel } from './notes-panel';
import { ImagesPanel } from './images-panel';
import { HistoryTimeline } from './history-timeline';
import { SiteMapCard, buildGoogleMapsUrl } from './site-map-card';
import { SiteDocumentsTab } from './site-documents-tab';
import { SiteEmailButton } from './site-email-dialog';
import { SiteBusinessTab } from './site-business-tab';
import { SiteOverviewTab } from './site-overview-tab';
import { SiteProjectsTab } from './site-projects-tab';
import { SiteMaintenanceTab } from './site-maintenance-tab';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/shared/hooks/use-auth';
import { useAuthStore } from '@/stores/auth-store';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useBreadcrumbTrail } from '@/stores/breadcrumb-store';
import {
  Pencil, Archive, Building2, MapPin, Key, Home,
  Wrench, FileText, Image as ImageIcon, Activity, Files, Receipt,
  User, Phone, Smartphone, Mail,
  LayoutGrid, FolderKanban, Settings2, Eye, EyeOff, Check, Layers,
} from 'lucide-react';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';

const cantonName = (code) => CH_CANTONS.find((c) => c.code === code)?.name || code;

const partyHasContent = (p) => !!(p && (p.name || p.careOf || p.street || p.postalCode || p.city || p.canton));

function PartyCard({ title, party, icon: Icon }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="space-y-0.5 text-[13px] text-foreground">
        {party.name && <p className="font-medium">{party.name}</p>}
        {party.careOf && <p className="text-muted-foreground">c/o {party.careOf}</p>}
        {party.street && <p>{party.street}</p>}
        {(party.postalCode || party.city) && <p>{[party.postalCode, party.city].filter(Boolean).join(' ')}</p>}
        {party.canton && <p className="text-muted-foreground">{cantonName(party.canton)}</p>}
      </div>
    </div>
  );
}

// Register (tab) catalog for the object detail. `permission` gates by role;
// `fixed` tabs can never be hidden by the user. The rest are user-toggleable
// (persisted to user.preferences.siteDetail.hiddenTabs) — like the dashboard.
const SITE_TABS = [
  { id: 'overview', labelKey: 'crm.sites.tab.overview', fallback: 'Überblick', icon: LayoutGrid, permission: 'crm:read', fixed: true },
  { id: 'projects', labelKey: 'crm.sites.tab.projects', fallback: 'Projekte', icon: FolderKanban, permission: 'projects:read' },
  { id: 'installations', labelKey: 'crm.installations.title', fallback: 'Komponenten', icon: Layers, permission: 'crm:read' },
  { id: 'maintenance', labelKey: 'crm.maintenance.objectTitle', fallback: 'Wartungen', icon: Wrench, permission: 'crm:read' },
  { id: 'business', labelKey: 'crm.sites.businessTab', fallback: 'Offerten & Aufträge', icon: Receipt, permission: 'crm:read' },
  { id: 'images', labelKey: 'crm.images.title', fallback: 'Bilder', icon: ImageIcon, permission: 'crm:read' },
  { id: 'documents', labelKey: 'crm.documents.title', fallback: 'Dokumente', icon: Files, permission: 'crm:read' },
  { id: 'notes', labelKey: 'crm.notes.title', fallback: 'Notizen', icon: FileText, permission: 'crm:read' },
  { id: 'activity', labelKey: 'common.activity', fallback: 'Aktivität', icon: Activity, permission: 'crm:read' },
];

/** Popover to let each user choose which registers (tabs) to show. */
function SiteTabsConfigPopover({ permittedTabs, hiddenTabs, onSave, t }) {
  const [local, setLocal] = useState(hiddenTabs);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocal(hiddenTabs); }, [hiddenTabs]);

  const toggle = (id) => setLocal((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const handleSave = async () => { setSaving(true); await onSave(local); setSaving(false); };

  return (
    <div className="w-64 space-y-3">
      <p className="text-sm font-semibold text-foreground">{t('crm.sites.configTabs', 'Register anpassen')}</p>
      <div className="space-y-1">
        {permittedTabs.map((tab) => {
          const Icon = tab.icon;
          const visible = !local.includes(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              disabled={tab.fixed}
              onClick={() => toggle(tab.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors',
                tab.fixed ? 'cursor-not-allowed opacity-60' : visible ? 'bg-accent/50 text-foreground' : 'text-muted-foreground hover:bg-accent/30',
              )}
            >
              <span className="flex items-center gap-2">
                {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {t(tab.labelKey, tab.fallback)}
              </span>
              {visible && <Check className="h-3.5 w-3.5 text-emerald-500" />}
            </button>
          );
        })}
      </div>
      <Button type="button" size="sm" className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? t('common.saving', 'Speichern...') : t('common.save', 'Speichern')}
      </Button>
    </div>
  );
}

export function SiteDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();

  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [configOpen, setConfigOpen] = useState(false);

  const canWrite = hasPermission('crm:write');
  const canDelete = hasPermission('crm:delete');

  // Registers the user's role may see (permission-gated), then minus the ones
  // this user chose to hide. Overview stays first and can never be hidden.
  const hiddenTabs = useMemo(() => user?.preferences?.siteDetail?.hiddenTabs || [], [user?.preferences?.siteDetail?.hiddenTabs]);
  const permittedTabs = useMemo(() => SITE_TABS.filter((tab) => !tab.permission || hasPermission(tab.permission)), [hasPermission]);
  const visibleTabs = useMemo(() => permittedTabs.filter((tab) => tab.fixed || !hiddenTabs.includes(tab.id)), [permittedTabs, hiddenTabs]);
  const safeActiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : (visibleTabs[0]?.id || 'overview');

  const handleSaveTabs = async (nextHidden) => {
    try {
      const res = await apiClient.patch(ENDPOINTS.AUTH.USER_PREFERENCES, { siteDetail: { hiddenTabs: nextHidden } });
      const prefs = res.data?.preferences ?? res.preferences ?? {};
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setUser({ ...currentUser, preferences: prefs });
      setConfigOpen(false);
    } catch {
      /* next reload restores saved state */
    }
  };

  const { data: site, isLoading } = useQuery({
    queryKey: queryKeys.crm.sites.detail(id),
    queryFn: () => siteService.getById(id),
    enabled: !!id,
  });

  // getById does not populate the customer, so fetch it separately: the edit
  // form needs its address to offer "Gleich wie Kunde", and the header shows the
  // customer's contact data on every tab. Loaded whenever a parent exists.
  const parentCustomerId = site?.customerId?._id || site?.customerId || null;
  const { data: parentCustomer } = useQuery({
    queryKey: queryKeys.crm.customers.detail(parentCustomerId),
    queryFn: () => customerService.getCustomerById(parentCustomerId),
    enabled: !!parentCustomerId,
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

  // The URL (/crm/sites/:id) has no parent customer — publish the chain so the
  // header breadcrumb can show Kunde › Objekt.
  useBreadcrumbTrail(id, [
    ...(site?.customerId
      ? [{
          label: site.customerId?.name || '',
          path: `/crm/customers/${site.customerId?._id || site.customerId}`,
        }]
      : []),
    { label: site?.name || '' },
  ]);

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
  const routeUrl = buildGoogleMapsUrl(site);

  return (
    <div className="space-y-6">

      {/* Hero Header card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
        {/* Amber accent stripe for site/object */}
        <div className="h-1 w-full bg-linear-to-r from-amber-500 via-amber-400 to-transparent" />
        <div className="p-6 flex items-start gap-4 flex-wrap">
          <div className={cn('h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center ring-1 ring-amber-500/20', typeMeta.bg)}>
            <Building2 className={cn('h-7 w-7', typeMeta.color)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-[22px] font-bold text-foreground tracking-tight">{site.name}</h1>
              <span className={cn('inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full', typeMeta.bg, typeMeta.color)}>
                {t(`crm.sites.type.${site.siteType}`, typeMeta.label)}
              </span>
              {!isActive && (
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  {t('crm.sites.statusInactive', 'Inaktiv')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-[13px] text-muted-foreground flex-wrap">
              {addressLine && (
                routeUrl ? (
                  <a
                    href={routeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('crm.siteRouteHint', 'In Google Maps öffnen')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline underline-offset-2 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5" /> {addressLine}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {addressLine}
                  </span>
                )
              )}
              {site.floorUnit && (
                <span className="inline-flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5" /> {site.floorUnit}
                </span>
              )}
              {site.accessInstructions && (
                <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Key className="h-3.5 w-3.5" /> {t('crm.sites.accessInfoBadge', 'Zugangsinfos vorhanden')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canWrite && (
              <SiteEmailButton siteId={id} defaultTo={parentCustomer?.email} />
            )}
            {canWrite && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFormOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> {t('common.edit', 'Bearbeiten')}
              </Button>
            )}
            {canDelete && isActive && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 hover:border-red-500/40 hover:text-red-600 hover:bg-red-500/10"
                onClick={() => setDeactivateOpen(true)}
              >
                <Archive className="h-3.5 w-3.5" /> {t('crm.sites.deactivate', 'Deaktivieren')}
              </Button>
            )}
          </div>
        </div>

        {/* Customer contact — kept in the persistent header so it stays visible
            on every tab (client requirement). */}
        {customerId && (
          <div className="px-6 pb-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                <User className="h-3.5 w-3.5" /> {t('crm.sites.customerLabel', 'Kunde')}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <button
                  type="button"
                  onClick={() => router.push(`/crm/customers/${customerId}`)}
                  className="font-medium text-foreground hover:underline underline-offset-2"
                >
                  {parentCustomer?.name || customerName || '—'}
                </button>
                {parentCustomer?.phone && (
                  <a href={`tel:${parentCustomer.phone}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Phone className="h-3.5 w-3.5" /> {parentCustomer.phone}
                  </a>
                )}
                {parentCustomer?.mobile && (
                  <a href={`tel:${parentCustomer.mobile}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Smartphone className="h-3.5 w-3.5" /> {parentCustomer.mobile}
                  </a>
                )}
                {parentCustomer?.email && (
                  <a href={`mailto:${parentCustomer.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <Mail className="h-3.5 w-3.5" /> {parentCustomer.email}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {site.accessInstructions && (
          <div className="px-6 pb-5">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                <Key className="h-3.5 w-3.5" /> {t('crm.sites.accessInstructions', 'Zugangsinformationen')}
              </div>
              <p className="text-[13px] text-foreground whitespace-pre-wrap">{site.accessInstructions}</p>
            </div>
          </div>
        )}

        {(partyHasContent(site.billingAddress) || partyHasContent(site.ownership)) && (
          <div className="grid gap-3 px-6 pb-5 sm:grid-cols-2">
            {partyHasContent(site.billingAddress) && (
              <PartyCard title={t('crm.sites.billingAddress', 'Rechnungsadresse')} party={site.billingAddress} icon={Building2} />
            )}
            {partyHasContent(site.ownership) && (
              <PartyCard title={t('crm.sites.ownership', 'Eigentümerschaft')} party={site.ownership} icon={Home} />
            )}
          </div>
        )}
      </div>

      {/* Registers (tabs) — permission-gated + user-customizable, like the dashboard */}
      <Tabs value={safeActiveTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex items-center gap-2 border-b border-border">
          <TabsList variant="line" className="flex-wrap border-b-0">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" /> {t(tab.labelKey, tab.fallback)}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <Popover open={configOpen} onOpenChange={setConfigOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto h-8 shrink-0 gap-1.5 text-muted-foreground">
                <Settings2 className="h-4 w-4" /> {t('crm.sites.configTabs', 'Register anpassen')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <SiteTabsConfigPopover permittedTabs={permittedTabs} hiddenTabs={hiddenTabs} onSave={handleSaveTabs} t={t} />
            </PopoverContent>
          </Popover>
        </div>

        <TabsContent value="overview">
          <SiteOverviewTab siteId={id} site={site} onNavigate={setActiveTab} />
        </TabsContent>
        <TabsContent value="projects">
          <SiteProjectsTab siteId={id} />
        </TabsContent>
        <TabsContent value="installations">
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <InstallationsPanel siteId={id} customerId={customerId} />
            <div className="space-y-4">
              <SiteMapCard site={site} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="maintenance">
          <SiteMaintenanceTab siteId={id} />
        </TabsContent>
        <TabsContent value="business">
          <SiteBusinessTab siteId={id} />
        </TabsContent>
        <TabsContent value="images">
          <ImagesPanel entityType="site" entityId={id} />
        </TabsContent>
        <TabsContent value="documents">
          <SiteDocumentsTab siteId={id} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesPanel entityType="site" entityId={id} />
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
        customer={parentCustomer}
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
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
