'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useLanguage } from '@/lib/i18n/language-context';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useQuotationMutations } from '../hooks/use-qop-mutations';
import { LineItemsEditor } from './line-items-editor';
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
  notes: '',
  internalNote: '',
  version: undefined,
});

export function QuotationFormDialog({ open, onClose, quotation = null }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const isEdit = !!quotation;

  const [form, setForm] = useState(EMPTY_FORM);
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);

  const { createQuotation, updateQuotation } = useQuotationMutations();
  const isPending = createQuotation.isPending || updateQuotation.isPending;

  // Customer search
  const { data: customerResults = [] } = useQuery({
    queryKey: ['crm', 'customers', 'search', customerQuery],
    queryFn: () => apiClient.get(ENDPOINTS.CRM.CUSTOMERS, { params: { q: customerQuery, limit: 10 } }),
    enabled: customerQuery.length >= 2,
    select: (r) => r.data ?? [],
  });

  // Department list
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiClient.get('/admin/departments'),
    select: (r) => r.data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  // Projects for selected customer
  const { data: projects = [] } = useQuery({
    queryKey: ['pm', 'projects', 'for-customer', form.customerId],
    queryFn: () => apiClient.get(ENDPOINTS.PM.PROJECTS, { params: { customerId: form.customerId, limit: 50, status: 'ACTIVE' } }),
    enabled: !!form.customerId,
    select: (r) => Array.isArray(r.data) ? r.data : [],
  });

  // Populate form on edit
  useEffect(() => {
    if (quotation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        notes: quotation.notes ?? '',
        internalNote: quotation.internalNote ?? '',
        version: quotation.version,
      });
      setCustomerQuery(quotation.customerName ?? quotation.customer?.name ?? '');
    } else {
      setForm(EMPTY_FORM());
      setCustomerQuery('');
    }
  }, [quotation, open]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

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
      catalogItemId: li.catalogItemId || undefined,
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
      notes: form.notes || undefined,
    };
    if (isEdit) {
      await updateQuotation.mutateAsync({ id: quotation._id ?? quotation.id, data: { ...payload, version: form.version } });
    } else {
      await createQuotation.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEdit
              ? (de ? 'Offerte bearbeiten' : 'Edit Quotation')
              : (de ? 'Neue Offerte' : 'New Quotation')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            {/* Customer */}
            <div className="relative col-span-2 md:col-span-1 flex flex-col gap-1.5">
              <Label>{de ? 'Kunde *' : 'Customer *'}</Label>
              <Input
                value={customerQuery}
                onChange={(e) => { setCustomerQuery(e.target.value); setShowCustomerList(true); }}
                onFocus={() => setShowCustomerList(true)}
                placeholder={de ? 'Kunden suchen...' : 'Search customer...'}
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
              <Label>{de ? 'Währung' : 'Currency'}</Label>
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
              <Label>{de ? 'Gültig bis *' : 'Valid Until *'}</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
                required
              />
            </div>

            {/* Department (required) */}
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Abteilung *' : 'Department *'}</Label>
              <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={de ? 'Abteilung wählen...' : 'Select department...'} />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d._id ?? d.id} value={d._id ?? d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project (optional) */}
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Projekt (optional)' : 'Project (optional)'}</Label>
              <Select value={form.projectId || 'NONE'} onValueChange={(v) => set('projectId', v === 'NONE' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={de ? 'Kein Projekt' : 'No project'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{de ? '— Kein Projekt —' : '— No project —'}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id ?? p.id} value={p._id ?? p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document Language */}
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Dokument-Sprache' : 'Document Language'}</Label>
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
              <Label>{de ? 'Globalrabatt %' : 'Global Discount %'}</Label>
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

          <Separator />

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              {de ? 'Positionen' : 'Line Items'}
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
              <Label>{de ? 'Bemerkungen (für Kunden)' : 'Notes (for customer)'}</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder={de ? 'Optionale Anmerkungen...' : 'Optional notes...'}
                className="resize-none text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Interne Notiz' : 'Internal Note'}</Label>
              <Textarea
                rows={3}
                value={form.internalNote}
                onChange={(e) => set('internalNote', e.target.value)}
                placeholder={de ? 'Intern (nicht auf Dokument)...' : 'Internal (not on document)...'}
                className="resize-none text-sm"
              />
            </div>
          </div>

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
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isPending || !form.customerId || !form.departmentId}>
              {isPending
                ? (de ? 'Speichern...' : 'Saving...')
                : isEdit ? (de ? 'Aktualisieren' : 'Update') : (de ? 'Erstellen' : 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
