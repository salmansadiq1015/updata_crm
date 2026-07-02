'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Combobox } from '@/components/ui/combobox';
import {
  ReceiptText, ClipboardList, Coins, Clock, CalendarDays, Building2, FolderKanban, Languages, SearchX,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { useBillingPlan, useOrders, useQopCustomerProjects, useQopDepartments } from '../hooks/use-qop-queries';
import { LineItemsEditor } from './line-items-editor';
import { CURRENCIES } from '../constants/qop-constants';
import {
  LANGUAGE_OPTIONS, buildDepartmentOptions, buildOrderOptions, buildPaymentTermOptions, buildProjectOptions,
  getEntityId, mapLineItemsForPayload, toDateInputValue, withEditableLineIds,
} from '../utils/document-form-utils';

const PAYMENT_TERMS = [7, 10, 14, 20, 30, 45, 60];
const ORDER_PICKER_LIMIT = 25;
const ORDER_SEARCH_DEBOUNCE_MS = 250;

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

function getOrderDisplayLabel(order) {
  const orderNumber = order?.orderNumber || order?._id || order?.id;
  const customerName = order?.customerName ?? order?.customerId?.name;
  return [orderNumber, customerName].filter(Boolean).join(' - ');
}

const EMPTY_FORM = () => ({
  customerId: '',
  customerName: '',
  departmentId: '',
  projectId: '',
  language: 'de',
  title: '',
  currency: 'CHF',
  globalDiscountPercent: 0,
  paymentTermsDays: 30,
  paymentTermsText: '',
  dueDate: addDays(30),
  sourceOrderId: '',
  lineItems: [],
  notes: '',
  milestonePercent: 30,
  milestoneAmount: '',
  milestoneAmountMode: 'percent',
  milestoneDescription: '',
});

// type: 'STANDARD' | 'ADVANCE' | 'FINAL'
export function InvoiceFormDialog({
  open,
  onClose,
  type = 'STANDARD',
  sourceOrderId,
  sourceQuotationId,
  sourceOrder = null,
  sourceQuotation = null,
  invoice = null,
}) {
  const { t } = useLanguage();
  const isEdit = Boolean(invoice);
  const {
    createInvoiceFromOrder, createInvoiceFromQuotation,
    createAdvanceInvoice, createFinalInvoice, updateInvoice,
  } = useInvoiceMutations();

  const isPending = createInvoiceFromOrder.isPending
    || createInvoiceFromQuotation.isPending
    || createAdvanceInvoice.isPending
    || createFinalInvoice.isPending
    || updateInvoice.isPending;

  const [form, setForm] = useState(EMPTY_FORM);
  const [orderSearch, setOrderSearch] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedOrderSnapshot, setSelectedOrderSnapshot] = useState(null);
  const debouncedOrderSearch = useDebounce(orderSearch.trim(), ORDER_SEARCH_DEBOUNCE_MS);
  const debouncedProjectQuery = useDebounce(projectQuery.trim(), 250);
  const shouldLoadOrderOptions = open && !isEdit && !sourceOrderId && !sourceQuotationId;
  const orderFilters = useMemo(() => ({
    limit: ORDER_PICKER_LIMIT,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(debouncedOrderSearch ? { search: debouncedOrderSearch } : {}),
  }), [debouncedOrderSearch]);
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
  const {
    data: orderData,
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    isError: ordersError,
  } = useOrders(orderFilters, { enabled: shouldLoadOrderOptions });
  const orders = useMemo(() => orderData?.items ?? [], [orderData?.items]);

  const orderOptions = useMemo(() => buildOrderOptions(orders), [orders]);
  const departmentOptions = useMemo(() => buildDepartmentOptions(departments), [departments]);
  const projectOptions = useMemo(() => buildProjectOptions(projects), [projects]);
  const projectPickerLoading = projectsLoading || projectQuery.trim() !== debouncedProjectQuery;
  const paymentTermOptions = useMemo(
    () => buildPaymentTermOptions(PAYMENT_TERMS, t('qop.invoices.daysNet', 'days net')),
    [t],
  );

  const selectedOrder = useMemo(
    () => sourceOrder
      || selectedOrderSnapshot
      || orders.find((order) => String(order._id ?? order.id) === String(form.sourceOrderId)),
    [form.sourceOrderId, orders, selectedOrderSnapshot, sourceOrder],
  );
  const selectedOrderLabel = selectedOrder ? getOrderDisplayLabel(selectedOrder) : undefined;
  const trimmedOrderSearch = orderSearch.trim();
  const orderPickerLoading = ordersLoading || ordersFetching || trimmedOrderSearch !== debouncedOrderSearch;
  const effectiveSourceOrderId = sourceOrderId || form.sourceOrderId || '';
  const effectiveSourceOrder = sourceOrder || selectedOrder || null;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setOrderSearch('');
      setProjectQuery('');
      setSelectedOrderSnapshot(sourceOrder || null);
      if (invoice) {
        const customerId = getEntityId(invoice.customerId ?? invoice.customer);
        setForm({
          customerId,
          customerName: invoice.customerName ?? invoice.customerId?.name ?? '',
          departmentId: getEntityId(invoice.departmentId),
          projectId: getEntityId(invoice.projectId),
          language: invoice.language ?? 'de',
          title: invoice.title ?? '',
          currency: invoice.currency || 'CHF',
          globalDiscountPercent: invoice.globalDiscountPercent ?? 0,
          paymentTermsDays: invoice.paymentTermsDays ?? 30,
          paymentTermsText: invoice.paymentTermsText ?? '',
          dueDate: toDateInputValue(invoice.dueDate) || addDays(invoice.paymentTermsDays ?? 30),
          sourceOrderId: getEntityId(invoice.sourceOrderId),
          lineItems: withEditableLineIds(invoice.lineItems ?? []),
          notes: '',
          milestonePercent: invoice.milestonePercent ?? 30,
          milestoneAmount: '',
          milestoneAmountMode: 'percent',
          milestoneDescription: invoice.milestoneDescription ?? '',
          version: invoice.version,
        });
        return;
      }
      setForm({
        customerId: '',
        customerName: '',
        departmentId: '',
        projectId: '',
        language: 'de',
        title: '',
        currency: sourceOrder?.currency || 'CHF',
        globalDiscountPercent: 0,
        paymentTermsDays: 30,
        paymentTermsText: '',
        dueDate: addDays(30),
        sourceOrderId: sourceOrderId || '',
        lineItems: type === 'STANDARD'
          ? (sourceOrder?.lineItems ?? []).map((li, i) => ({ ...li, _uid: i }))
          : [],
        notes: '',
        milestonePercent: 30,
        milestoneAmount: '',
        milestoneAmountMode: 'percent',
        milestoneDescription: '',
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [invoice, open, sourceOrder, sourceOrderId, type]);

  useEffect(() => {
    if (isEdit || !open || !effectiveSourceOrder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => ({
      ...current,
      currency: effectiveSourceOrder.currency || current.currency,
      ...(type === 'STANDARD'
        ? { lineItems: (effectiveSourceOrder.lineItems ?? []).map((li, i) => ({ ...li, _uid: i })) }
        : {}),
    }));
  }, [effectiveSourceOrder, isEdit, open, type]);

  const { data: billingPlan } = useBillingPlan(!isEdit && type === 'FINAL' ? effectiveSourceOrderId : null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleTermChange = (days) => {
    set('paymentTermsDays', days);
    set('dueDate', addDays(Number(days)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isEdit) {
      await updateInvoice.mutateAsync({
        id: invoice._id ?? invoice.id,
        data: {
          customerName: form.customerName,
          departmentId: form.departmentId || undefined,
          projectId: form.projectId || undefined,
          language: form.language,
          title: form.title || undefined,
          currency: form.currency,
          globalDiscountPercent: Number(form.globalDiscountPercent) || 0,
          dueDate: form.dueDate,
          paymentTermsDays: Number(form.paymentTermsDays),
          paymentTermsText: form.paymentTermsText || undefined,
          lineItems: mapLineItemsForPayload(form.lineItems),
          version: form.version,
          sourceOrderId: form.sourceOrderId || undefined,
        },
      });
      onClose();
      return;
    }

    const base = {
      sourceOrderId: effectiveSourceOrderId || undefined,
      sourceQuotationId: sourceQuotationId || undefined,
      currency: form.currency,
      paymentTermsDays: Number(form.paymentTermsDays),
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    };

    if (type === 'ADVANCE') {
      if (!effectiveSourceOrderId) return;
      const advancePayload = {
        ...base,
        milestoneDescription: form.milestoneDescription || undefined,
      };
      if (form.milestoneAmountMode === 'fixed') {
        advancePayload.milestoneAmount = Number(form.milestoneAmount);
      } else {
        advancePayload.milestonePercent = Number(form.milestonePercent);
      }
      await createAdvanceInvoice.mutateAsync(advancePayload);
    } else if (type === 'FINAL') {
      if (!effectiveSourceOrderId) return;
      await createFinalInvoice.mutateAsync({ ...base });
    } else if (effectiveSourceOrderId) {
      const lineSelections = form.lineItems
        .map((li) => ({
          sourceOrderLinePosition: Number(li.sourceOrderLinePosition ?? li.position),
          quantity: Number(li.quantity),
        }))
        .filter((li) => Number.isInteger(li.sourceOrderLinePosition) && li.sourceOrderLinePosition > 0 && li.quantity > 0);
      await createInvoiceFromOrder.mutateAsync({
        ...base,
        lineSelections: lineSelections.length ? lineSelections : undefined,
      });
    } else if (sourceQuotationId) {
      await createInvoiceFromQuotation.mutateAsync({
        sourceQuotationId,
        dueDate: form.dueDate,
        paymentTermsDays: Number(form.paymentTermsDays),
      });
    } else {
      return;
    }
    onClose();
  };

  const titleMap = {
    STANDARD: t('qop.invoices.formTitleStandard', 'New Invoice'),
    ADVANCE:  t('qop.invoices.formTitleAdvance', 'Advance Invoice'),
    FINAL:    t('qop.invoices.formTitleFinal', 'Final Invoice'),
  };

  const canSubmit = isEdit
    ? invoice?.status === 'DRAFT' && Boolean(form.customerName && form.dueDate && form.version)
    : (type === 'STANDARD'
      ? Boolean(effectiveSourceOrderId || sourceQuotationId)
      : Boolean(effectiveSourceOrderId));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-border/70 bg-popover/95 p-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {isEdit ? t('qop.invoices.editTitle', 'Edit invoice') : titleMap[type]}
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('qop.invoices.formSubtitle', 'Issue an invoice from an order or quotation.')}
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5">
          {isEdit && (
            <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label>{t('qop.form.customer', 'Customer')}</Label>
                  <Input
                    value={form.customerName}
                    onChange={(event) => set('customerName', event.target.value)}
                    className="h-11 rounded-xl"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label>{t('qop.orders.title', 'Title')}</Label>
                  <Input
                    value={form.title}
                    onChange={(event) => set('title', event.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.form.department', 'Department')}</Label>
                  <Combobox
                    triggerIcon={Building2}
                    options={departmentOptions}
                    value={form.departmentId}
                    allowClear
                    loading={departmentsLoading}
                    onChange={(value) => set('departmentId', value || '')}
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
                  <Label>{t('qop.form.project', 'Project')}</Label>
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
                  <Label>{t('qop.form.currency', 'Currency')}</Label>
                  <Combobox
                    searchable={false}
                    triggerIcon={Coins}
                    options={CURRENCIES}
                    value={form.currency}
                    onChange={(value) => set('currency', value)}
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
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.invoices.paymentTerms', 'Payment Terms')}</Label>
                  <Combobox
                    searchable={false}
                    triggerIcon={Clock}
                    options={paymentTermOptions}
                    value={String(form.paymentTermsDays)}
                    onChange={handleTermChange}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.invoices.dueDate', 'Due Date')}</Label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(event) => set('dueDate', event.target.value)}
                      className="h-11 rounded-xl pl-9"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isEdit && !sourceOrderId && !sourceQuotationId && (
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.invoices.orderField', 'Order')}</Label>
                <Combobox
                  async
                  triggerIcon={ClipboardList}
                  options={orderOptions}
                  value={form.sourceOrderId}
                  selectedLabel={selectedOrderLabel}
                  loading={orderPickerLoading}
                  onSearchChange={setOrderSearch}
                  onChange={(value) => {
                    setSelectedOrderSnapshot(
                      orders.find((order) => String(order._id ?? order.id) === String(value)) || null,
                    );
                    set('sourceOrderId', value);
                  }}
                  placeholder={t('qop.invoices.selectOrder', 'Select order')}
                  searchPlaceholder={t('qop.invoices.searchOrder', 'Search by number, title, or customer...')}
                  emptyIcon={ordersError || trimmedOrderSearch ? SearchX : ClipboardList}
                  emptyMessage={ordersError
                    ? t('qop.invoices.ordersLoadError', 'Orders could not be loaded')
                    : trimmedOrderSearch
                      ? t('qop.invoices.orderNoResults', 'No matching orders found')
                      : t('qop.invoices.noOrders', 'No billable orders')}
                  emptyHint={ordersError
                    ? t('qop.invoices.ordersLoadErrorHint', 'Check the connection and try again.')
                    : trimmedOrderSearch
                      ? t('qop.invoices.orderNoResultsHint', 'Try another order number, title, or customer.')
                      : t('qop.invoices.noOrdersHint', 'Create or confirm an order first.')}
                  contentClassName="z-[70]"
                  ariaLabel={t('qop.invoices.orderField', 'Order')}
                />
              </div>
            </div>
          )}

          {!isEdit && sourceQuotationId && sourceQuotation && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
              <span className="font-medium text-emerald-600 dark:text-emerald-300">{sourceQuotation.quotationNumber}</span>
              <span className="text-emerald-700 dark:text-emerald-200"> - {sourceQuotation.customerName}</span>
            </div>
          )}

          {/* Header fields */}
          {!isEdit && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.invoices.paymentTerms', 'Payment Terms')}</Label>
                <Combobox
                  searchable={false}
                  triggerIcon={Clock}
                  options={paymentTermOptions}
                  value={String(form.paymentTermsDays)}
                  onChange={handleTermChange}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.invoices.dueDate', 'Due Date')}</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => set('dueDate', e.target.value)}
                    className="h-11 rounded-xl pl-9"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Advance invoice fields */}
          {!isEdit && type === 'ADVANCE' && (
            <div className="flex flex-col gap-4 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
              <div className="flex gap-2">
                <Button
                  type="button" size="sm"
                  variant={form.milestoneAmountMode === 'percent' ? 'default' : 'outline'}
                  onClick={() => set('milestoneAmountMode', 'percent')}
                >
                  {t('qop.invoices.modePercent', 'Percent %')}
                </Button>
                <Button
                  type="button" size="sm"
                  variant={form.milestoneAmountMode === 'fixed' ? 'default' : 'outline'}
                  onClick={() => set('milestoneAmountMode', 'fixed')}
                >
                  {t('qop.invoices.modeFixed', 'Fixed CHF')}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {form.milestoneAmountMode === 'percent' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>{t('qop.invoices.advancePercent', 'Advance %')}</Label>
                    <Input
                      type="number" min="1" max="100" step="0.1"
                      value={form.milestonePercent}
                      onChange={(e) => set('milestonePercent', e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label>{t('qop.invoices.advanceAmount', 'Amount (CHF)')}</Label>
                    <Input
                      type="number" min="0.05" step="0.05"
                      value={form.milestoneAmount}
                      onChange={(e) => set('milestoneAmount', e.target.value)}
                      className="h-11 rounded-xl"
                      required
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.invoices.milestoneDesc', 'Milestone description')}</Label>
                  <Input
                    value={form.milestoneDescription}
                    onChange={(e) => set('milestoneDescription', e.target.value)}
                    placeholder={t('qop.invoices.milestoneDescPlaceholder', 'e.g. Advance at order start')}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Final invoice — advance deduction preview */}
          {!isEdit && type === 'FINAL' && billingPlan && (
            <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
              <p className="text-sm font-medium text-violet-700 dark:text-violet-200">
                {t('qop.invoices.finalPreviewTitle', 'Preview: advance payment deductions')}
              </p>
              <div className="overflow-hidden rounded-xl border border-violet-500/20 bg-card text-sm">
                <div className="grid grid-cols-[1fr_5rem_5rem_6rem] border-b bg-violet-500/10 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <div>{t('qop.orders.billingAdvInvoice', 'Advance invoice')}</div>
                  <div className="text-right">{t('qop.orders.billingDate', 'Date')}</div>
                  <div className="text-right">%</div>
                  <div className="text-right">{t('qop.orders.colAmount', 'Amount')}</div>
                </div>
                {(billingPlan.advances ?? []).map((adv) => (
                  <div key={adv._id} className="grid grid-cols-[1fr_5rem_5rem_6rem] border-b px-3 py-2 last:border-0">
                    <div className="font-mono text-muted-foreground">{adv.invoiceNumber}</div>
                    <div className="text-right text-muted-foreground">{adv.invoiceDate?.slice(0, 10) ?? '—'}</div>
                    <div className="text-right">{adv.milestonePercent ?? '—'}%</div>
                    <div className="text-right font-medium text-red-500">− {fmt(adv.grandTotalRounded)}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_6rem] border-t bg-violet-500/10 px-3 py-2.5 font-semibold">
                  <div>{t('qop.invoices.finalBalanceDue', 'Balance due')}</div>
                  <div className="text-right">{fmt(billingPlan.remainingForFinal)} {sourceOrder?.currency ?? 'CHF'}</div>
                </div>
              </div>
            </div>
          )}

          {!isEdit && type === 'FINAL' && !billingPlan && (
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm text-violet-700 dark:text-violet-200">
              {t('qop.invoices.finalHint', 'The final invoice shows the total amount minus all previous advance payments.')}
            </div>
          )}

          {/* Line items for Standard invoices */}
          {(isEdit || (type === 'STANDARD' && effectiveSourceOrderId)) && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">{t('qop.form.positions', 'Line Items')}</Label>
                <LineItemsEditor value={form.lineItems} onChange={(items) => set('lineItems', items)} />
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label>{isEdit ? t('qop.invoices.paymentTermsText', 'Payment terms text') : t('qop.form.notes', 'Notes')}</Label>
            <Textarea
              rows={isEdit ? 5 : 3}
              value={isEdit ? form.paymentTermsText : form.notes}
              onChange={(e) => set(isEdit ? 'paymentTermsText' : 'notes', e.target.value)}
              placeholder={t('qop.invoices.notesPlaceholder', 'Optional notes on invoice...')}
              className="resize-y rounded-xl text-sm"
            />
          </div>

          <DialogFooter className="sticky bottom-0 -mx-6 -mb-5 border-t border-border/70 bg-popover/95 px-6 py-4 supports-backdrop-filter:backdrop-blur-xl">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {isPending
                ? t('common.saving', 'Saving...')
                : isEdit ? t('common.save', 'Save') : t('qop.invoices.createBtn', 'Create Invoice')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
