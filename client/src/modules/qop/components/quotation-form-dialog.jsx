'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import { useQopCustomerProjects, useQopCustomerSearch, useQopDepartments } from '../hooks/use-qop-queries';
import { useQuotationTemplateMutations } from '../hooks/use-qop-template-mutations';
import { LineItemsEditor } from './line-items-editor';
import { SelectTemplateDialog } from './select-template-dialog';
import { CURRENCIES, DEFAULT_VALIDITY_DAYS } from '../constants/qop-constants';
import { SourceDocumentsPanel } from '@/modules/doctpl/components/SourceDocumentsPanel';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = () => ({
  customerId: '',
  customerName: '',
  departmentId: '',
  projectId: '',
  language: 'de',
  currency: 'CHF',
  validUntil: addDays(new Date(), DEFAULT_VALIDITY_DAYS),
  globalDiscountPercent: 0,
  lineItems: [],
  introduction: '',
  notes: '',
  internalNote: '',
  paymentTerms: '',
  termsAndConditions: '',
  version: undefined,
});

export function QuotationFormDialog({ open, onClose, quotation = null }) {
  const { t } = useLanguage();
  const isEdit = !!quotation;

  const [form, setForm] = useState(EMPTY_FORM);
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { createQuotation, updateQuotation } = useQuotationMutations();
  const { recordUsage } = useQuotationTemplateMutations();
  const isPending = createQuotation.isPending || updateQuotation.isPending;

  const { data: customerResults = [] } = useQopCustomerSearch(customerQuery);
  const { data: departments = [] } = useQopDepartments();
  const { data: projects = [] } = useQopCustomerProjects(form.customerId);

  useEffect(() => {
    if (quotation) {
      setForm({
        customerId: quotation.customerId ?? quotation.customer?._id ?? '',
        customerName: quotation.customerName ?? quotation.customer?.name ?? '',
        departmentId: quotation.departmentId ?? '',
        projectId: quotation.projectId ?? '',
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
        version: quotation.version,
      });
      setCustomerQuery(quotation.customerName ?? quotation.customer?.name ?? '');
    } else {
      setForm(EMPTY_FORM());
      setCustomerQuery('');
      setShowAdvanced(false);
    }
  }, [quotation, open]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

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
    }));
    const payload = {
      customerId: form.customerId,
      customerName: form.customerName,
      departmentId: form.departmentId || undefined,
      projectId: form.projectId || undefined,
      language: form.language,
      currency: form.currency,
      validUntil: form.validUntil,
      globalDiscountPercent: Number(form.globalDiscountPercent) || 0,
      ...(mappedItems.length > 0 ? { lineItems: mappedItems } : {}),
      introduction: form.introduction || undefined,
      notes: form.notes || undefined,
      paymentTerms: form.paymentTerms || undefined,
      termsAndConditions: form.termsAndConditions || undefined,
    };
    if (isEdit) {
      await updateQuotation.mutateAsync({ id: quotation._id ?? quotation.id, data: { ...payload, version: form.version } });
    } else {
      await createQuotation.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">
                {isEdit
                  ? t('qop.form.editTitle', 'Offerte bearbeiten')
                  : t('qop.form.newTitle', 'Neue Offerte')}
              </DialogTitle>
              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowTemplateDialog(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('qop.form.fromTemplate', 'Aus Vorlage')}
                </Button>
              )}
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-4">
              {/* Customer */}
              <div className="relative col-span-2 md:col-span-1 flex flex-col gap-1.5">
                <Label>{t('qop.form.customer', 'Kunde')} *</Label>
                <Input
                  value={customerQuery}
                  onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerList(true); }}
                  onFocus={() => setShowCustomerList(true)}
                  placeholder={t('qop.form.customerSearch', 'Kunden suchen...')}
                  required={!form.customerId}
                />
                {showCustomerList && customerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md overflow-hidden">
                    {customerResults.map((c) => (
                      <button
                        key={c._id ?? c.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          set('customerId', c._id ?? c.id);
                          set('customerName', c.name);
                          setCustomerQuery(c.name);
                          setShowCustomerList(false);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.city && <span className="ml-2 text-muted-foreground text-xs">{c.city}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Currency */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.currency', 'Währung')}</Label>
                <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valid Until */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.validUntil', 'Gültig bis')} *</Label>
                <Input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => set('validUntil', e.target.value)}
                  required
                />
              </div>

              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.department', 'Abteilung')} *</Label>
                <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('qop.form.selectDepartment', 'Abteilung wählen...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d._id ?? d.id} value={d._id ?? d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Project */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.project', 'Projekt')} ({t('common.optional', 'optional')})</Label>
                <Select value={form.projectId || 'NONE'} onValueChange={(v) => set('projectId', v === 'NONE' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('qop.form.noProject', 'Kein Projekt')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t('qop.form.noProject', '— Kein Projekt —')}</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p._id ?? p.id} value={p._id ?? p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Document Language */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.language', 'Dokument-Sprache')}</Label>
                <Select value={form.language} onValueChange={(v) => set('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Global discount */}
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.globalDiscount', 'Globalrabatt %')}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.globalDiscountPercent}
                  onChange={(e) => set('globalDiscountPercent', e.target.value)}
                />
              </div>
            </div>

            {/* Introduction */}
            <div className="flex flex-col gap-1.5">
              <Label>{t('qop.form.introduction', 'Einleitung')}</Label>
              <Textarea
                rows={3}
                value={form.introduction}
                onChange={(e) => set('introduction', e.target.value)}
                placeholder={t('qop.form.introductionPlaceholder', 'Einleitungstext für das Dokument...')}
                className="resize-none text-sm"
                maxLength={5000}
              />
            </div>

            <Separator />

            {/* Line items */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">
                {t('qop.form.positions', 'Positionen')}
              </Label>
              <LineItemsEditor
                value={form.lineItems}
                onChange={(items) => set('lineItems', items)}
              />
            </div>

            <Separator />

            {/* Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.notes', 'Bemerkungen')} ({t('qop.form.forCustomer', 'für Kunden')})</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder={t('qop.form.notesPlaceholder', 'Optionale Anmerkungen...')}
                  className="resize-none text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('qop.form.internalNote', 'Interne Notiz')}</Label>
                <Textarea
                  rows={3}
                  value={form.internalNote}
                  onChange={(e) => set('internalNote', e.target.value)}
                  placeholder={t('qop.form.internalNotePlaceholder', 'Intern (nicht auf Dokument)...')}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            {/* Advanced fields toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {t('qop.form.advancedFields', 'Zahlungsbedingungen & AGB')}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.form.paymentTerms', 'Zahlungsbedingungen')}</Label>
                  <Textarea
                    rows={2}
                    value={form.paymentTerms}
                    onChange={(e) => set('paymentTerms', e.target.value)}
                    placeholder={t('qop.form.paymentTermsPlaceholder', 'z.B. 30 Tage netto')}
                    className="resize-none text-sm"
                    maxLength={1000}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t('qop.form.termsAndConditions', 'AGB')}</Label>
                  <Textarea
                    rows={4}
                    value={form.termsAndConditions}
                    onChange={(e) => set('termsAndConditions', e.target.value)}
                    placeholder={t('qop.form.termsPlaceholder', 'Allgemeine Geschäftsbedingungen...')}
                    className="resize-none text-sm"
                    maxLength={10000}
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                {t('common.cancel', 'Abbrechen')}
              </Button>
              <Button type="submit" disabled={isPending || !form.customerId || !form.departmentId}>
                {isPending
                  ? t('common.saving', 'Speichern...')
                  : isEdit ? t('common.save', 'Aktualisieren') : t('common.create', 'Erstellen')}
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
    </>
  );
}
