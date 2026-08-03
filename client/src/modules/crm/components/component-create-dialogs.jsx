'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n/language-context';
import { customerService } from '@/modules/crm/services/customer-service';
import { siteService } from '@/modules/crm/services/site-service';
import { installationService } from '@/modules/crm/services/installation-service';
import { maintenanceService } from '@/modules/crm/services/maintenance-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { InstallationForm } from './installation-form';
import { MaintenanceForm } from './maintenance-form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Search, MapPin, User, Building2, Loader2, ChevronRight, Wrench } from 'lucide-react';
import { INSTALLATION_TYPE_META } from '@/modules/crm/constants/crm-constants';

/** Shared list row for the two-step pickers. */
function PickRow({ icon: Icon, title, subtitle, onClick, iconCls }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-500/5"
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted', iconCls)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-brand-600" />
    </button>
  );
}

function PickerShell({ open, onOpenChange, icon: Icon, title, description, search, onSearch, searchPlaceholder, loading, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[80vh] rounded-2xl border border-border bg-card"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20 shrink-0">
              <Icon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-semibold text-foreground">{title}</DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="px-5 pt-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 h-9 text-[13px]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5 scrollbar-thin">
          {loading && (
            <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          )}
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Neue Komponente" from the Komponenten & Wartungen page: the component lives
 * under an object, so the flow is customer → object → component form.
 */
export function NewComponentFlow({ open, onOpenChange }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [customer, setCustomer] = useState(null);
  const [site, setSite] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250).trim();

  const close = (v) => {
    onOpenChange(v);
    if (!v) { setCustomer(null); setSite(null); setSearch(''); }
  };

  const { data: customers = [], isFetching: loadingCustomers } = useQuery({
    queryKey: debounced
      ? queryKeys.crm.customers.search(debounced)
      : queryKeys.crm.customers.list({ limit: 20, sortBy: 'name', sortOrder: 'asc', status: 'active' }),
    queryFn: async () => {
      const res = debounced
        ? await customerService.searchCustomers(debounced, 20)
        : await customerService.getCustomers({ limit: 20, sortBy: 'name', sortOrder: 'asc', status: 'active' });
      return res?.data || res?.items || (Array.isArray(res) ? res : []);
    },
    enabled: open && !customer,
  });

  const { data: sites = [], isFetching: loadingSites } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(customer?._id),
    queryFn: () => siteService.listByCustomer(customer._id),
    enabled: open && !!customer,
  });

  const createMut = useMutation({
    mutationFn: (data) => installationService.createForSite(site._id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.assetMaintenance.all() });
      qc.invalidateQueries({ queryKey: queryKeys.crm.maintenance.all() });
      qc.invalidateQueries({ queryKey: queryKeys.crm.sites.all() });
      showSuccess(t('crm.installations.createdToast', 'Komponente erstellt'));
      close(false);
    },
    onError: (err) => showError(err.message),
  });

  // Step 3 — the component form itself, scoped to the chosen object.
  if (customer && site) {
    return (
      <InstallationForm
        open={open}
        onOpenChange={close}
        onSubmit={(data) => createMut.mutateAsync(data)}
        isLoading={createMut.isPending}
        customerId={customer._id}
        primarySiteId={site._id}
      />
    );
  }

  // Step 2 — pick the object.
  if (customer) {
    return (
      <PickerShell
        open={open}
        onOpenChange={close}
        icon={MapPin}
        title={t('crm.installations.pickSite', 'Objekt wählen')}
        description={t('crm.installations.pickSiteDesc', 'Hauptobjekt, an dem die Komponente betrieben wird — {name}', { name: customer.name })}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t('crm.sites.searchPlaceholder', 'Objekt suchen...')}
        loading={loadingSites}
      >
        {sites
          .filter((s) => !search || (s.name || '').toLowerCase().includes(search.toLowerCase()))
          .map((s) => (
            <PickRow
              key={s._id}
              icon={Building2}
              iconCls="text-amber-600"
              title={s.name}
              subtitle={[s.street, [s.postalCode, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
              onClick={() => { setSite(s); setSearch(''); }}
            />
          ))}
        {!loadingSites && !sites.length && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t('crm.installations.noSitesForCustomer', 'Dieser Kunde hat noch keine Objekte.')}
          </p>
        )}
      </PickerShell>
    );
  }

  // Step 1 — pick the customer.
  return (
    <PickerShell
      open={open}
      onOpenChange={close}
      icon={User}
      title={t('crm.pickCustomer', 'Kunde wählen')}
      description={t('crm.installations.pickCustomerDesc', 'Kunde, dem die neue Komponente zugeordnet wird.')}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t('crm.searchCustomerPlaceholder', 'Kunde suchen...')}
      loading={loadingCustomers}
    >
      {customers.map((c) => (
        <PickRow
          key={c._id}
          icon={User}
          iconCls="text-brand-600"
          title={c.name}
          subtitle={c.customerNumber}
          onClick={() => { setCustomer(c); setSearch(''); }}
        />
      ))}
    </PickerShell>
  );
}

/**
 * "Neue Wartung": pick the component, then the existing maintenance form.
 */
export function NewMaintenanceFlow({ open, onOpenChange }) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [installation, setInstallation] = useState(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250).trim();

  const close = (v) => {
    onOpenChange(v);
    if (!v) { setInstallation(null); setSearch(''); }
  };

  const { data: installations = [], isFetching } = useQuery({
    queryKey: ['crm', 'installations', 'picker', debounced],
    queryFn: async () => {
      const res = await installationService.list({ limit: 20, ...(debounced ? { search: debounced } : {}) });
      return res?.data || res?.items || (Array.isArray(res) ? res : []);
    },
    enabled: open && !installation,
  });

  const createMut = useMutation({
    mutationFn: (data) => maintenanceService.createForInstallation(installation._id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.crm.assetMaintenance.all() });
      qc.invalidateQueries({ queryKey: queryKeys.crm.maintenance.all() });
      showSuccess(t('crm.maintenance.createdToast', 'Wartung erstellt'));
      close(false);
    },
    onError: (err) => showError(err.message),
  });

  if (installation) {
    return (
      <MaintenanceForm
        open={open}
        onOpenChange={close}
        onSubmit={(data) => createMut.mutateAsync(data)}
        isLoading={createMut.isPending}
      />
    );
  }

  return (
    <PickerShell
      open={open}
      onOpenChange={close}
      icon={Wrench}
      title={t('crm.maintenance.pickComponent', 'Komponente wählen')}
      description={t('crm.maintenance.pickComponentDesc', 'Komponente, für die eine Wartung angelegt wird.')}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t('crm.installations.searchPlaceholder', 'Nummer, Hersteller, Modell...')}
      loading={isFetching}
    >
      {installations.map((inst) => {
        const meta = INSTALLATION_TYPE_META[inst.type] || INSTALLATION_TYPE_META.other;
        return (
          <PickRow
            key={inst._id}
            icon={meta.icon}
            iconCls={meta.color}
            title={[t(`crm.installations.type.${inst.type}`, meta.label), inst.manufacturer, inst.model].filter(Boolean).join(' — ')}
            subtitle={[inst.installationNumber, inst.siteId?.name].filter(Boolean).join(' · ')}
            onClick={() => { setInstallation(inst); setSearch(''); }}
          />
        );
      })}
      {!isFetching && !installations.length && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t('crm.installations.emptySearch', 'Keine Komponenten gefunden.')}
        </p>
      )}
    </PickerShell>
  );
}
