'use client';

import { useState, useEffect, useMemo } from 'react';
import { showError } from '@/lib/toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  FileText, ChevronDown, ChevronUp, Building2, FolderKanban,
  Coins, Languages, Users, CalendarDays, SearchX, MapPin,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import {
  useQopCustomerProjects, useQopCustomerSearch, useQopDepartments, useQopSiteSearch,
} from '../hooks/use-qop-queries';
import { referenceService } from '../services/reference-service';
import { useQuotationTemplateMutations } from '../hooks/use-qop-template-mutations';
import { LineItemsEditor } from './line-items-editor';
import { SelectTemplateDialog } from './select-template-dialog';
import { TextBlockPickerDialog } from '@/modules/catalog';
import { CURRENCIES, DEFAULT_VALIDITY_DAYS, PAYMENT_TERMS_PRESETS } from '../constants/qop-constants';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  LANGUAGE_OPTIONS, buildCustomerOptions, buildDepartmentOptions, buildProjectOptions,
  buildSiteOptions, siteBillingParty, formatSiteParty,
} from '../utils/document-form-utils';
import { SourceDocumentsPanel } from '@/modules/doctpl/components/SourceDocumentsPanel';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const SALUTATION_SUGGESTIONS = [
  'Sehr geehrte Damen und Herren',
  'Sehr geehrte Frau ',
  'Sehr geehrter Herr ',
  'Liebe ',
  'Lieber ',
];

const QUOTATION_STATUS_OPTIONS = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED'];

const EMPTY_FORM = () => ({
  customerId: '',
  customerName: '',
  departmentId: '',
  projectId: '',
  siteId: '',
  siteName: '',
  billingAddressSource: 'customer',
  status: 'DRAFT',
  language: 'de',
  currency: 'CHF',
  validUntil: addDays(new Date(), DEFAULT_VALIDITY_DAYS),
  globalDiscountPercent: 0,
  lineItems: [],
  salutation: '',
  introduction: '',
  notes: '',
  internalNote: '',
  paymentTerms: '',
  termsAndConditions: '',
  subsidyAmount: 0,
  subsidyNote: '',
  clientSideWorks: '',
  version: undefined,
});

export function QuotationFormDialog({ open, onClose, quotation = null }) {
  const { t } = useLanguage();
  const isEdit = !!quotation;

  const [form, setForm] = useState(EMPTY_FORM);
  const [customerQuery, setCustomerQuery] = useState('');
  const [siteQuery, setSiteQuery] = useState('');
  // Full site record of the chosen Objekt — decides which billing parties
  // (Rechnungsadresse / Eigentümer / Verwaltung) can be offered.
  const [selectedSite, setSelectedSite] = useState(null);
  const [projectQuery, setProjectQuery] = useState('');
  const debouncedProjectQuery = useDebounce(projectQuery.trim(), 250);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Which text field the Textbaustein picker fills: 'introduction' | 'termsAndConditions' | 'clientSideWorks'
  const [textBlockTarget, setTextBlockTarget] = useState(null);

  const { createQuotation, updateQuotation, transitionQuotationStatus } = useQuotationMutations();
  const { recordUsage } = useQuotationTemplateMutations();
  const isPending = createQuotation.isPending || updateQuotation.isPending;

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
    if (quotation) {
      // Some fields come back populated (object {_id,...}) from the API → extract the id so the
      // selects/combobox can match the option and the save sends a valid objectId.
      const idOf = (v) => (v && typeof v === 'object' ? (v._id ?? v.id ?? '') : (v ?? ''));
      setForm({
        customerId: idOf(quotation.customerId) || quotation.customer?._id || '',
        customerName: quotation.customerName ?? quotation.customer?.name ?? '',
        departmentId: idOf(quotation.departmentId),
        projectId: idOf(quotation.projectId),
        siteId: idOf(quotation.siteId),
        siteName: quotation.siteId?.name ?? '',
        billingAddressSource: quotation.billingAddressSource ?? 'customer',
        status: quotation.status ?? 'DRAFT',
        salutation: quotation.salutation ?? '',
        language: quotation.language ?? 'de',
        currency: quotation.currency ?? 'CHF',
        validUntil: quotation.validUntil?.slice(0, 10) ?? addDays(new Date(), DEFAULT_VALIDITY_DAYS),
        globalDiscountPercent: quotation.globalDiscountPercent ?? 0,
        lineItems: (quotation.lineItems ?? []).map((li, i) => ({ ...li, _uid: i })),
        introduction: quotation.introduction ?? '',
        notes: quotation.notes ?? '',
        internalNote: quotation.internalNote ?? '',
        paymentTerms: quotation.paymentTerms ?? '',
        termsAndConditions: quotation.termsAndConditions ?? '',
        subsidyAmount: quotation.subsidyAmount ?? 0,
        subsidyNote: quotation.subsidyNote ?? '',
        clientSideWorks: quotation.clientSideWorks ?? '',
        version: quotation.version,
      });
    } else {
      setForm(EMPTY_FORM());
      setShowAdvanced(false);
    }
    setCustomerQuery('');
    setSiteQuery('');
    setSelectedSite(null);
    setProjectQuery('');
    // Reload the site record in edit mode so the billing-party options and the
    // Objekt label are available again.
    const existingSiteId = quotation?.siteId?._id ?? quotation?.siteId;
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
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [quotation, open]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // Objekt-first: picking a site derives the customer and resets the dependent
  // fields; the billing party falls back to 'customer' when the previous choice
  // does not exist on the new site.
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
      if (customerId) {
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

  // Insert a chosen Textbaustein into the targeted field. Einleitung and AGB are
  // rich-text (append the HTML); Bauseitige Arbeiten renders as plain text in the
  // PDF, so append the block's text without markup.
  const applyTextBlock = (block) => {
    const field = textBlockTarget;
    if (!field) return;
    const html = block?.bodyHtml || '';
    setForm((f) => {
      const current = f[field] || '';
      if (field === 'clientSideWorks' || field === 'subsidyNote') {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const text = (tmp.textContent || '').trim();
        return { ...f, [field]: current ? `${current}\n${text}` : text };
      }
      return { ...f, [field]: `${current}${html}` };
    });
    setTextBlockTarget(null);
  };

  const applyTemplate = (tpl) => {
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      language: tpl.language ?? f.language,
      currency: tpl.currency ?? f.currency,
      globalDiscountPercent: tpl.globalDiscountPercent ?? f.globalDiscountPercent,
      lineItems: (tpl.lineItems ?? []).map((li, i) => ({ ...li, _uid: i, vatRate: li.vatRate ?? 8.1 })),
      introduction: tpl.introduction ?? f.introduction,
      notes: tpl.notes ?? f.notes,
      paymentTerms: tpl.paymentTerms ?? f.paymentTerms,
      termsAndConditions: tpl.termsAndConditions ?? f.termsAndConditions,
    }));
    recordUsage.mutate(tpl._id ?? tpl.id);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const mappedItems = form.lineItems.map(({ _uid, ...li }) => ({
      type: li.type || 'service',
      position: li.position,
      description: li.description,
      unit: li.unit || undefined,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      discountPercent: Number(li.discountPercent) || 0,
      vatRate: Number(li.vatRate),
      catalogItemId: li.catalogItemId || li.catalogSnapshot?.catalogArticleId || undefined,
      catalogSnapshot: li.catalogSnapshot || undefined,
      image: li.image?.fileId
        ? { fileId: li.image.fileId, url: li.image.url || '', size: li.image.size || 'medium' }
        : null,
    }));
    const payload = {
      customerId: form.customerId,
      customerName: form.customerName,
      departmentId: form.departmentId || undefined,
      projectId: form.projectId || undefined,
      siteId: form.siteId || null,
      billingAddressSource: form.billingAddressSource || 'customer',
      language: form.language,
      currency: form.currency,
      validUntil: form.validUntil,
      globalDiscountPercent: Number(form.globalDiscountPercent) || 0,
      ...(mappedItems.length > 0 ? { lineItems: mappedItems } : {}),
      salutation: form.salutation || '',
      introduction: form.introduction || undefined,
      notes: form.notes || undefined,
      paymentTerms: form.paymentTerms || undefined,
      termsAndConditions: form.termsAndConditions || undefined,
      subsidyAmount: Number(form.subsidyAmount) || 0,
      subsidyNote: form.subsidyNote || undefined,
      clientSideWorks: form.clientSideWorks || undefined,
    };
    try {
      if (isEdit) {
        const id = quotation._id ?? quotation.id;
        const statusChanged = form.status && form.status !== quotation.status;
        // Versionsverwaltung: sent quotations are editable too — the server
        // freezes the previous state as a revision and bumps V. Only converted
        // ones are locked (their content lives on in the order).
        if (quotation.status !== 'CONVERTED') {
          await updateQuotation.mutateAsync({ id, data: { ...payload, version: form.version } });
        }
        if (statusChanged) {
          await transitionQuotationStatus.mutateAsync({ id, targetStatus: form.status });
        }
      } else {
        await createQuotation.mutateAsync({
          ...payload,
          ...(form.status && form.status !== 'DRAFT' ? { status: form.status } : {}),
        });
      }
      onClose();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto border-border/70 bg-popover/95 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
          <DialogHeader className="border-b border-border/70 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold tracking-tight">
                    {isEdit ? t('qop.form.editTitle', 'Edit quotation') : t('qop.form.newTitle', 'New Quotation')}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('qop.form.subtitle', 'Draft a customer quotation with positions and document texts.')}
                  </p>
                </div>
              </div>
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mr-8 gap-1.5 rounded-lg text-xs"
                  onClick={() => setShowTemplateDialog(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('qop.form.fromTemplate', 'From Template')}
                </Button>
              )}
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5">
            {/* Versionsverwaltung: editing a sent quotation creates the next version */}
            {isEdit && quotation && !['DRAFT', 'CONVERTED'].includes(quotation.status) && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[13px] text-amber-800 dark:text-amber-200">
                {t('qop.versions.editHint', 'Diese Offerte wurde bereits versendet. Beim Speichern entsteht Version V{next} — die bisherige Fassung bleibt im Verlauf erhalten und ältere PDFs werden automatisch archiviert.', { next: (quotation.docVersion ?? 1) + 1 })}
              </div>
            )}
            {/* Header fields */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Objekt — picked first; the customer is derived from it */}
              <div className="flex flex-col gap-1.5">
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

              {/* Customer */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.customer', 'Customer')} *</Label>
                <Combobox
                  async
                  triggerIcon={Users}
                  options={customerOptions}
                  value={form.customerId}
                  selectedLabel={form.customerName}
                  loading={customersLoading}
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
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label>{t('qop.form.billingAddressSource', 'Rechnungsadresse')}</Label>
                  <Select
                    value={form.billingAddressSource}
                    onValueChange={(v) => set('billingAddressSource', v)}
                  >
                    <SelectTrigger className="rounded-xl text-sm">
                      <SelectValue />
                    </SelectTrigger>
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

              {/* Status — visible and manually adjustable */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.status', 'Status')}</Label>
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger className="rounded-xl text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTATION_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{t(`qop.status.${s}`, s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Currency */}
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

              {/* Valid Until */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.validUntil', 'Valid Until')} *</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => set('validUntil', e.target.value)}
                    className="h-11 rounded-xl pl-9"
                    required
                  />
                </div>
              </div>

              {/* Department */}
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

              {/* Project */}
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

              {/* Document Language */}
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

              {/* Global discount */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.globalDiscount', 'Global Discount %')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.globalDiscountPercent}
                  onChange={(e) => set('globalDiscountPercent', e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {/* Anrede — free text with quick suggestions (Sie- oder Du-Form) */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.salutation', 'Anrede')}</Label>
              <Input
                list="qop-salutation-suggestions"
                value={form.salutation}
                onChange={(e) => set('salutation', e.target.value)}
                placeholder={t('qop.form.salutationPlaceholder', 'z.B. Sehr geehrte Frau Berger oder Liebe Kseniya')}
                className="rounded-xl text-sm"
                maxLength={255}
              />
              <datalist id="qop-salutation-suggestions">
                {SALUTATION_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>

            {/* Introduction — rich text */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>{t('qop.form.introduction', 'Introduction')}</Label>
                <button
                  type="button"
                  onClick={() => setTextBlockTarget('introduction')}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('qop.form.insertTextBlock', 'Textbaustein einfügen')}
                </button>
              </div>
              <RichTextEditor
                value={form.introduction}
                onChange={(html) => set('introduction', html)}
                placeholder={t('qop.form.introductionPlaceholder', 'Introduction text for the document...')}
                maxLength={5000}
              />
            </div>

            <Separator />

            {/* Line items */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">{t('qop.form.positions', 'Line Items')}</Label>
              <LineItemsEditor
                value={form.lineItems}
                onChange={(items) => set('lineItems', items)}
              />
            </div>

            <Separator />

            {/* Notes */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.notes', 'Notes')} ({t('qop.form.forCustomer', 'for customer')})</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder={t('qop.form.notesPlaceholder', 'Optional notes...')}
                  className="resize-none rounded-xl text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.internalNote', 'Internal note')}</Label>
                <Textarea
                  rows={3}
                  value={form.internalNote}
                  onChange={(e) => set('internalNote', e.target.value)}
                  placeholder={t('qop.form.internalNotePlaceholder', 'Internal (not on document)...')}
                  className="resize-none rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Advanced fields toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {t('qop.form.advancedFields', 'Payment terms & T&C')}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 gap-4">
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
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t('qop.form.termsAndConditions', 'Terms & Conditions')}</Label>
                    <button
                      type="button"
                      onClick={() => setTextBlockTarget('termsAndConditions')}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t('qop.form.insertTextBlock', 'Textbaustein einfügen')}
                    </button>
                  </div>
                  <RichTextEditor
                    value={form.termsAndConditions}
                    onChange={(html) => set('termsAndConditions', html)}
                    placeholder={t('qop.form.termsPlaceholder', 'General terms and conditions...')}
                    maxLength={10000}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.form.subsidyAmount', 'Fördergelder (Abzug)')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.subsidyAmount}
                    onChange={(e) => set('subsidyAmount', e.target.value)}
                    placeholder="0.00"
                    className="rounded-xl text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t('qop.form.subsidyNote', 'Fördergelder-Hinweis')}</Label>
                    <button
                      type="button"
                      onClick={() => setTextBlockTarget('subsidyNote')}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t('qop.form.insertTextBlock', 'Textbaustein einfügen')}
                    </button>
                  </div>
                  <Textarea
                    rows={4}
                    value={form.subsidyNote}
                    onChange={(e) => set('subsidyNote', e.target.value)}
                    placeholder={t('qop.form.subsidyNotePlaceholder', 'z.B. Fördergelder Basel-Land ...')}
                    className="resize-none rounded-xl text-sm"
                    maxLength={5000}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t('qop.form.clientSideWorks', 'Bauseitige Arbeiten und Lieferungen')}</Label>
                    <button
                      type="button"
                      onClick={() => setTextBlockTarget('clientSideWorks')}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t('qop.form.insertTextBlock', 'Textbaustein einfügen')}
                    </button>
                  </div>
                  <Textarea
                    rows={2}
                    value={form.clientSideWorks}
                    onChange={(e) => set('clientSideWorks', e.target.value)}
                    placeholder={t('qop.form.clientSideWorksPlaceholder', 'z.B. Freiräumen Arbeitsbereich ...')}
                    className="resize-none rounded-xl text-sm"
                    maxLength={5000}
                  />
                </div>
              </div>
            )}

            {isEdit && quotation && (
              <>
                <Separator />
                <SourceDocumentsPanel
                  sourceModule="qop"
                  sourceRecordId={quotation._id ?? quotation.id}
                  templateType="quotation"
                  documentData={quotation}
                  language={form.language}
                />
              </>
            )}

            <DialogFooter className="sticky bottom-0 -mx-6 -mb-5 border-t border-border/70 bg-popover/95 px-6 py-4 supports-backdrop-filter:backdrop-blur-xl">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={isPending || !form.customerId || !form.departmentId}>
                {isPending
                  ? t('common.saving', 'Saving...')
                  : isEdit ? t('common.save', 'Save') : t('common.create', 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SelectTemplateDialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        onSelect={(tpl) => {
          applyTemplate(tpl);
          setShowTemplateDialog(false);
        }}
      />

      <TextBlockPickerDialog
        open={!!textBlockTarget}
        onClose={() => setTextBlockTarget(null)}
        onSelect={applyTextBlock}
      />
    </>
  );
}
