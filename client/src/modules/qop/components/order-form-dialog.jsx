'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  PackageCheck, Users, Building2, FolderKanban, Coins, Languages, CalendarDays,
  SearchX, MapPin,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useOrderMutations } from '../hooks/use-qop-mutations';
import {
  useQopCustomerProjects, useQopCustomerSearch, useQopDepartments, useQopSiteSearch,
} from '../hooks/use-qop-queries';
import { referenceService } from '../services/reference-service';
import { showError } from '@/lib/toast';
import { CURRENCIES, PAYMENT_TERMS_PRESETS } from '../constants/qop-constants';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LineItemsEditor } from './line-items-editor';
import {
  LANGUAGE_OPTIONS, buildCustomerOptions, buildDepartmentOptions, buildProjectOptions,
  buildSiteOptions, siteBillingParty, formatSiteParty,
  getEntityId, mapLineItemsForPayload, toDateInputValue, withEditableLineIds,
} from '../utils/document-form-utils';

const EMPTY_FORM = () => ({
  customerId: '',
  customerName: '',
  departmentId: '',
  projectId: '',
  siteId: '',
  siteName: '',
  billingAddressSource: 'customer',
  language: 'de',
  title: '',
  currency: 'CHF',
  globalDiscountPercent: 0,
  requestedDate: '',
  paymentTerms: '',
  notes: '',
  specialInstructions: '',
  termsAndConditions: '',
  lineItems: [],
  version: undefined,
});

export function OrderFormDialog({ open, onClose, order = null }) {
  const { t } = useLanguage();
  const isEdit = Boolean(order);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customerQuery, setCustomerQuery] = useState('');
  const [siteQuery, setSiteQuery] = useState('');
  // Full site record of the chosen Objekt — decides which billing parties
  // (Rechnungsadresse / Eigentümer / Verwaltung) can be offered.
  const [selectedSite, setSelectedSite] = useState(null);
  const [projectQuery, setProjectQuery] = useState('');
  const debouncedProjectQuery = useDebounce(projectQuery.trim(), 250);

  const { createOrder, updateOrder } = useOrderMutations();
  const isPending = createOrder.isPending || updateOrder.isPending;

  const { data: customerResults = [], isFetching: customersLoading } = useQopCustomerSearch(customerQuery);
  const { data: siteResults = [], isFetching: sitesLoading } = useQopSiteSearch(siteQuery);
  const {
    data: departments = [],
    isFetching: departmentsLoading,
    isError: departmentsError,
  } = useQopDepartments();
  const {
    data: projects = [],
    isFetching: projectsLoading,
    isError: projectsError,
  } = useQopCustomerProjects(form.customerId, debouncedProjectQuery);

  const customerOptions = useMemo(() => buildCustomerOptions(customerResults), [customerResults]);
  const siteOptions = useMemo(() => buildSiteOptions(siteResults), [siteResults]);
  const departmentOptions = useMemo(() => buildDepartmentOptions(departments), [departments]);
  const projectOptions = useMemo(() => buildProjectOptions(projects), [projects]);
  const projectPickerLoading = projectsLoading || projectQuery.trim() !== debouncedProjectQuery;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) return;
    if (order) {
      const customerId = getEntityId(order.customerId ?? order.customer);
      setForm({
        customerId,
        customerName: order.customerName ?? order.customerId?.name ?? '',
        departmentId: getEntityId(order.departmentId),
        projectId: getEntityId(order.projectId),
        siteId: getEntityId(order.siteId),
        siteName: order.siteId?.name ?? '',
        billingAddressSource: order.billingAddressSource ?? 'customer',
        language: order.language ?? 'de',
        title: order.title ?? '',
        currency: order.currency ?? 'CHF',
        globalDiscountPercent: order.globalDiscountPercent ?? 0,
        requestedDate: toDateInputValue(order.requestedDate),
        paymentTerms: order.paymentTerms ?? '',
        notes: order.notes ?? '',
        specialInstructions: order.specialInstructions ?? '',
        termsAndConditions: order.termsAndConditions ?? '',
        lineItems: withEditableLineIds(order.lineItems ?? []),
        version: order.version,
      });
      setCustomerQuery('');
      setSiteQuery('');
      setProjectQuery('');
      // Reload the site so the billing-party options are available again.
      const existingSiteId = order.siteId?._id ?? order.siteId;
      setSelectedSite(null);
      if (existingSiteId) {
        referenceService.getSite(existingSiteId)
          .then((res) => {
            const site = res?.data ?? res;
            if (site?._id) {
              setSelectedSite(site);
              setForm((f) => ({ ...f, siteName: site.name || site.street || '' }));
            }
          })
          .catch(() => {});
      }
      return;
    }

    setForm(EMPTY_FORM());
    setCustomerQuery('');
    setSiteQuery('');
    setSelectedSite(null);
    setProjectQuery('');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, order]);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  // Objekt-first, same rule as the quotation: picking a site derives the
  // customer and offers that site's parties as the printed billing address.
  const applySite = async (siteId, option) => {
    if (!siteId) {
      setSelectedSite(null);
      setForm((f) => ({ ...f, siteId: '', siteName: '', billingAddressSource: 'customer' }));
      return;
    }
    set('siteId', siteId);
    set('siteName', option?.label ?? '');
    try {
      const res = await referenceService.getSite(siteId);
      const site = res?.data ?? res;
      setSelectedSite(site || null);
      const customerId = site?.customerId?._id ?? site?.customerId;
      // On an existing order the customer is fixed, so only the billing party
      // is adjustable — never silently move an order to another customer.
      if (customerId && !isEdit) {
        let customerName = site?.customerId?.name || '';
        if (!customerName) {
          const customerRes = await referenceService.getCustomer(customerId);
          customerName = (customerRes?.data ?? customerRes)?.name || '';
        }
        setForm((f) => ({
          ...f,
          customerId: String(customerId),
          customerName,
          projectId: '',
          billingAddressSource: siteBillingParty(site, f.billingAddressSource) ? f.billingAddressSource : 'customer',
        }));
        setProjectQuery('');
      }
    } catch (err) {
      showError(err);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      customerId: form.customerId,
      customerName: form.customerName,
      departmentId: form.departmentId || undefined,
      projectId: form.projectId || undefined,
      siteId: form.siteId || null,
      billingAddressSource: form.billingAddressSource || 'customer',
      language: form.language,
      title: form.title || undefined,
      currency: form.currency,
      globalDiscountPercent: Number(form.globalDiscountPercent) || 0,
      requestedDate: form.requestedDate || undefined,
      paymentTerms: form.paymentTerms || undefined,
      notes: form.notes || undefined,
      specialInstructions: form.specialInstructions || undefined,
      termsAndConditions: form.termsAndConditions || undefined,
      lineItems: mapLineItemsForPayload(form.lineItems),
    };

    if (isEdit) {
      const editablePayload = { ...payload };
      delete editablePayload.customerId;
      await updateOrder.mutateAsync({
        id: order._id ?? order.id,
        data: { ...editablePayload, version: form.version },
      });
    } else {
      await createOrder.mutateAsync(payload);
    }
    onClose();
  };

  const canSubmit = isEdit
    ? Boolean(form.customerName && form.version)
    : Boolean(form.customerId && form.customerName && form.departmentId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-5xl max-h-[90vh] overflow-y-auto border-border/70 bg-popover/95 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl"
      >
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {isEdit ? t('qop.orders.editTitle', 'Edit order') : t('qop.orders.new', 'New Order')}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('qop.orders.formSubtitle', 'Create and maintain confirmed customer work orders.')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Objekt — picked first; the customer is derived from it */}
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label>{t('qop.form.site', 'Objekt')} ({t('common.optional', 'optional')})</Label>
              <Combobox
                async
                triggerIcon={MapPin}
                options={siteOptions}
                value={form.siteId}
                selectedLabel={form.siteName}
                allowClear
                loading={sitesLoading}
                onSearchChange={setSiteQuery}
                onChange={(value, option) => applySite(value, option)}
                placeholder={t('qop.form.siteSearch', 'Objekt suchen...')}
                searchPlaceholder={t('qop.form.siteSearch', 'Objekt suchen...')}
                emptyIcon={MapPin}
                emptyMessage={t('qop.form.siteNoResults', 'Keine Objekte gefunden')}
                emptyHint={t('qop.form.siteHint', 'Der Kunde wird automatisch vom Objekt übernommen.')}
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label>{t('qop.form.customer', 'Customer')} *</Label>
              <Combobox
                async
                triggerIcon={Users}
                options={customerOptions}
                value={form.customerId}
                selectedLabel={form.customerName}
                loading={customersLoading}
                disabled={isEdit}
                onSearchChange={setCustomerQuery}
                onChange={(value, option) => {
                  set('customerId', value);
                  set('customerName', option?.label ?? '');
                  set('projectId', '');
                  setProjectQuery('');
                }}
                placeholder={t('qop.form.customerSearch', 'Search customer...')}
                searchPlaceholder={t('qop.form.customerSearch', 'Search customer...')}
                emptyIcon={Users}
                emptyMessage={customerQuery.length < 2
                  ? t('qop.form.customerSearchHintTitle', 'Search customers')
                  : t('qop.form.customerNoResults', 'No customers found')}
                emptyHint={customerQuery.length < 2
                  ? t('qop.form.customerSearchHint', 'Type at least 2 characters to search.')
                  : t('qop.form.customerNoResultsHint', 'Try a different name or number.')}
              />
            </div>

            {/* Billing party — only offered once an Objekt is chosen */}
            {form.siteId && (
              <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-4">
                <Label>{t('qop.form.billingAddressSource', 'Rechnungsadresse')}</Label>
                <Select
                  value={form.billingAddressSource}
                  onValueChange={(v) => set('billingAddressSource', v)}
                >
                  <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">
                      {t('qop.form.billingCustomer', 'Kunde')}{form.customerName ? ` — ${form.customerName}` : ''}
                    </SelectItem>
                    {siteBillingParty(selectedSite, 'site_billing') && (
                      <SelectItem value="site_billing">
                        {t('qop.form.billingSite', 'Rechnungsadresse des Objekts')} — {formatSiteParty(siteBillingParty(selectedSite, 'site_billing'))}
                      </SelectItem>
                    )}
                    {siteBillingParty(selectedSite, 'site_ownership') && (
                      <SelectItem value="site_ownership">
                        {t('qop.form.billingOwnership', 'Eigentümer')} — {formatSiteParty(siteBillingParty(selectedSite, 'site_ownership'))}
                      </SelectItem>
                    )}
                    {siteBillingParty(selectedSite, 'site_management') && (
                      <SelectItem value="site_management">
                        {t('qop.form.billingManagement', 'Verwaltung')} — {formatSiteParty(siteBillingParty(selectedSite, 'site_management'))}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('qop.form.billingHint', 'Diese Adresse erscheint als Empfänger auf dem Dokument.')}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.department', 'Department')} *</Label>
              <Combobox
                triggerIcon={Building2}
                options={departmentOptions}
                value={form.departmentId}
                loading={departmentsLoading}
                onChange={(value) => set('departmentId', value)}
                placeholder={t('qop.form.selectDepartment', 'Select department...')}
                searchPlaceholder={t('qop.form.departmentSearch', 'Search departments...')}
                emptyIcon={departmentsError ? SearchX : Building2}
                emptyMessage={departmentsError
                  ? t('qop.form.departmentsLoadError', 'Departments could not be loaded')
                  : t('qop.form.noDepartments', 'No departments found')}
                emptyHint={departmentsError
                  ? t('qop.form.referencesLoadErrorHint', 'Check your connection and permissions, then try again.')
                  : t('qop.form.noDepartmentsHint', 'Create a department in settings first.')}
                noResultsMessage={t('qop.form.noMatchingDepartments', 'No matching departments')}
                noResultsHint={t('qop.form.noMatchingDepartmentsHint', 'Try another name or code.')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.currency', 'Currency')}</Label>
              <Combobox
                searchable={false}
                triggerIcon={Coins}
                options={CURRENCIES}
                value={form.currency}
                onChange={(value) => set('currency', value)}
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label>{t('qop.orders.title', 'Title')}</Label>
              <Input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder={t('qop.orders.titlePlaceholder', 'Short internal order title...')}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.project', 'Project')} ({t('common.optional', 'optional')})</Label>
              <Combobox
                async
                triggerIcon={FolderKanban}
                options={projectOptions}
                value={form.projectId}
                allowClear
                loading={projectPickerLoading}
                onSearchChange={setProjectQuery}
                onChange={(value) => set('projectId', value || '')}
                placeholder={form.customerId
                  ? t('qop.form.noProject', 'No project')
                  : t('qop.form.selectCustomerFirst', 'Select a customer first')}
                searchPlaceholder={t('qop.form.projectSearch', 'Search projects...')}
                emptyIcon={projectsError ? SearchX : FolderKanban}
                emptyMessage={projectsError
                  ? t('qop.form.projectsLoadError', 'Projects could not be loaded')
                  : form.customerId
                    ? t('qop.form.noProjects', 'No projects for this customer')
                    : t('qop.form.selectCustomerFirst', 'Select a customer first')}
                emptyHint={projectsError
                  ? t('qop.form.referencesLoadErrorHint', 'Check your connection and permissions, then try again.')
                  : form.customerId ? undefined : t('qop.form.projectsNeedCustomer', 'Projects are filtered by customer.')}
                noResultsMessage={form.customerId ? t('qop.form.noMatchingProjects', 'No matching projects') : undefined}
                noResultsHint={form.customerId ? t('qop.form.noMatchingProjectsHint', 'Try another project number or name.') : undefined}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.orders.requestedDate', 'Requested date')}</Label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={form.requestedDate}
                  onChange={(event) => set('requestedDate', event.target.value)}
                  className="h-11 rounded-xl pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.language', 'Document Language')}</Label>
              <Combobox
                searchable={false}
                triggerIcon={Languages}
                options={LANGUAGE_OPTIONS}
                value={form.language}
                onChange={(value) => set('language', value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.globalDiscount', 'Global Discount %')}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.globalDiscountPercent}
                onChange={(event) => set('globalDiscountPercent', event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Label>{t('qop.form.positions', 'Line Items')}</Label>
            <LineItemsEditor value={form.lineItems} onChange={(items) => set('lineItems', items)} />
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.notes', 'Notes')}</Label>
              <Textarea
                rows={5}
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder={t('qop.orders.notesPlaceholder', 'Customer-facing notes for the order...')}
                className="resize-y rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.orders.specialInstructions', 'Special instructions')}</Label>
              <Textarea
                rows={5}
                value={form.specialInstructions}
                onChange={(event) => set('specialInstructions', event.target.value)}
                placeholder={t('qop.orders.specialInstructionsPlaceholder', 'Internal execution notes for the team...')}
                className="resize-y rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.paymentTerms', 'Zahlungsbedingungen')}</Label>
              <Select
                value={form.paymentTerms || ''}
                onValueChange={(v) => set('paymentTerms', v)}
              >
                <SelectTrigger className="rounded-xl text-sm">
                  <SelectValue placeholder={t('qop.form.paymentTermsPlaceholder', 'Zahlungsbedingung wählen...')} />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS_PRESETS.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.termsAndConditions', 'Terms & Conditions')}</Label>
              <RichTextEditor
                value={form.termsAndConditions}
                onChange={(html) => set('termsAndConditions', html)}
                placeholder={t('qop.form.termsPlaceholder', 'General terms and conditions...')}
                maxLength={10000}
              />
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 -mx-6 -mb-5 border-t border-border/70 bg-popover/95 px-6 py-4 supports-backdrop-filter:backdrop-blur-xl">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending
                ? t('common.saving', 'Saving...')
                : isEdit ? t('common.save', 'Save') : t('qop.orders.create', 'Create order')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
