'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createSiteSchema } from '@/modules/crm/validations/site';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, MapPin, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';

const BLANK_PARTY = { name: '', careOf: '', street: '', postalCode: '', city: '', canton: '' };

const BLANK = {
  name: '',
  street: '',
  postalCode: '',
  city: '',
  canton: '',
  country: 'CH',
  floorUnit: '',
  accessInstructions: '',
  siteType: 'residential',
  latitude: null,
  longitude: null,
  billingAddress: { ...BLANK_PARTY },
  ownership: { ...BLANK_PARTY },
};

// Coerce a stored party (nullable fields) into blank-safe form values.
const partyValues = (party) => ({
  name: party?.name || '',
  careOf: party?.careOf || '',
  street: party?.street || '',
  postalCode: party?.postalCode || '',
  city: party?.city || '',
  canton: party?.canton || '',
});

const PARTY_FIELDS = ['name', 'careOf', 'street', 'postalCode', 'city', 'canton'];

// The customer record uses `addressSupplement` where a site party uses `careOf`.
const customerToParty = (customer) => (customer ? {
  name: customer.name || '',
  careOf: customer.addressSupplement || '',
  street: customer.street || '',
  postalCode: customer.postalCode || '',
  city: customer.city || '',
  canton: customer.canton || '',
} : null);

const sameParty = (a, b) => !!a && !!b && PARTY_FIELDS.every((f) => (a[f] || '') === (b[f] || ''));

// Drop an all-empty party to null so we don't persist empty blocks.
const cleanParty = (party) => {
  if (!party) return null;
  const values = {
    name: party.name?.trim() || null,
    careOf: party.careOf?.trim() || null,
    street: party.street?.trim() || null,
    postalCode: party.postalCode?.trim() || null,
    city: party.city?.trim() || null,
    canton: party.canton || null,
  };
  return Object.values(values).some(Boolean) ? values : null;
};

export function SiteForm({ open, onOpenChange, onSubmit, defaultValues, isLoading, customer }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const customerParty = useMemo(() => customerToParty(customer), [customer]);
  // 'customer' | 'billing' | 'manual' — how each party block is filled.
  const [billingMode, setBillingMode] = useState('manual');
  const [ownerMode, setOwnerMode] = useState('manual');
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createSiteSchema),
    defaultValues: BLANK,
  });

  // On open, infer the mode from the stored data so an object saved as
  // "same as customer" reopens on that option instead of falling back to manual.
  useEffect(() => {
    if (!open) return;
    const billing = partyValues(defaultValues?.billingAddress);
    const owner = partyValues(defaultValues?.ownership);
    if (!defaultValues) {
      setBillingMode(customerParty ? 'customer' : 'manual');
      setOwnerMode(customerParty ? 'customer' : 'manual');
      return;
    }
    setBillingMode(sameParty(billing, customerParty) ? 'customer' : 'manual');
    if (sameParty(owner, customerParty)) setOwnerMode('customer');
    else if (sameParty(owner, billing)) setOwnerMode('billing');
    else setOwnerMode('manual');
  }, [open, defaultValues, customerParty]);

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        ...defaultValues,
        name: defaultValues.name || '',
        street: defaultValues.street || '',
        postalCode: defaultValues.postalCode || '',
        city: defaultValues.city || '',
        canton: defaultValues.canton || '',
        country: defaultValues.country || 'CH',
        floorUnit: defaultValues.floorUnit || '',
        accessInstructions: defaultValues.accessInstructions || '',
        siteType: defaultValues.siteType || 'residential',
        billingAddress: partyValues(defaultValues.billingAddress),
        ownership: partyValues(defaultValues.ownership),
      });
    } else {
      reset(BLANK);
    }
  }, [defaultValues, reset, open]);

  const canton = watch('canton');
  const siteType = watch('siteType');
  const billingCanton = watch('billingAddress.canton');
  const ownerCanton = watch('ownership.canton');

  const billingParty = PARTY_FIELDS.reduce((acc, f) => {
    acc[f] = watch(`billingAddress.${f}`) || '';
    return acc;
  }, {});
  // Object identity changes on every render, so effects key off the serialized form.
  const billingKey = JSON.stringify(billingParty);

  const applyParty = (prefix, source) => {
    if (!source) return;
    PARTY_FIELDS.forEach((f) => setValue(`${prefix}.${f}`, source[f] || '', { shouldDirty: true }));
  };

  // Mirror the source into the block for as long as a non-manual mode is active,
  // so editing the customer's address upstream keeps the copy in sync.
  useEffect(() => {
    if (billingMode === 'customer') applyParty('billingAddress', customerParty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingMode, customerParty]);

  useEffect(() => {
    if (ownerMode === 'customer') applyParty('ownership', customerParty);
    else if (ownerMode === 'billing') applyParty('ownership', billingParty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerMode, customerParty, billingKey]);

  const billingLocked = billingMode !== 'manual';
  const ownerLocked = ownerMode !== 'manual';

  const submit = async (data) => {
    const cleaned = {
      ...data,
      street: data.street || null,
      postalCode: data.postalCode || null,
      city: data.city || null,
      canton: data.canton || null,
      floorUnit: data.floorUnit || null,
      accessInstructions: data.accessInstructions || null,
      billingAddress: cleanParty(data.billingAddress),
      ownership: cleanParty(data.ownership),
    };
    try {
      await onSubmit(cleaned);
      onOpenChange(false);
    } catch {
      // keep modal open on failure
    }
  };

  const inputCls = 'bg-background border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20';
  const selectTriggerCls = 'bg-background border-border rounded-lg h-9 text-[13px] text-foreground focus:border-amber-500/50 focus:ring-amber-500/20';
  // Mirrored blocks stay readable but clearly not editable.
  const lockedCls = 'bg-muted/60 text-muted-foreground cursor-not-allowed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
              <MapPin className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit ? t('crm.sites.editSite', 'Objekt bearbeiten') : t('crm.sites.newSite', 'Neues Objekt')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {t('crm.sites.formDesc', 'Gebäude oder Standort, an dem Komponenten betrieben werden.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            <DarkField label={t('crm.sites.label', 'Bezeichnung')} required error={errors.name}>
              <Input
                {...register('name')}
                autoFocus
                placeholder={t('crm.sites.labelPlaceholder', 'z.B. Mehrfamilienhaus Mustergasse')}
                className={inputCls}
              />
            </DarkField>

            <DarkField label={t('crm.sites.type', 'Objekttyp')} error={errors.siteType}>
              <Select value={siteType} onValueChange={(v) => setValue('siteType', v, { shouldDirty: true })}>
                <SelectTrigger className={selectTriggerCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Object.entries(SITE_TYPE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key} className="text-foreground focus:bg-muted/50 focus:text-foreground">
                      {t(`crm.sites.type.${key}`, meta.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DarkField>

            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.address', 'Adresse')}
            </p>

            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
              <DarkField label={t('crm.street', 'Strasse')} error={errors.street}>
                <Input {...register('street')} className={inputCls} />
              </DarkField>
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <DarkField label={t('crm.postalCode', 'PLZ')} error={errors.postalCode}>
                  <Input {...register('postalCode')} className={inputCls} />
                </DarkField>
                <DarkField label={t('crm.city', 'Ort')} error={errors.city}>
                  <Input {...register('city')} className={inputCls} />
                </DarkField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <DarkField label={t('crm.canton', 'Kanton')} error={errors.canton}>
                  <Select value={canton || ''} onValueChange={(v) => setValue('canton', v, { shouldDirty: true })}>
                    <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-72 bg-card border-border">
                      {CH_CANTONS.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-foreground focus:bg-muted/50 focus:text-foreground">{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DarkField>
                <DarkField label={t('crm.sites.floorUnit', 'Etage / Einheit')} error={errors.floorUnit}>
                  <Input
                    {...register('floorUnit')}
                    placeholder={t('crm.sites.floorUnitPlaceholder', 'z.B. 3. OG')}
                    className={inputCls}
                  />
                </DarkField>
              </div>
            </div>

            <DarkField label={t('crm.sites.accessInstructions', 'Zugangsinformationen')} error={errors.accessInstructions}>
              <Textarea
                rows={2}
                {...register('accessInstructions')}
                placeholder={t('crm.sites.accessInstructionsPlaceholder', 'z.B. Schlüssel bei Hauswart Huber')}
                className="bg-background border-border rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20 resize-none"
              />
            </DarkField>

            {/* Billing address (Rechnungsadresse) — feedback #10 */}
            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.sites.billingAddress', 'Rechnungsadresse')}
            </p>
            <FillModeSwitch
              name={t('crm.sites.billingAddress', 'Rechnungsadresse')}
              value={billingMode}
              onChange={setBillingMode}
              options={[
                ...(customerParty ? [{ value: 'customer', label: t('crm.sites.sameAsCustomer', 'Gleich wie Kunde') }] : []),
                { value: 'manual', label: t('crm.sites.manualEntry', 'Manuelle Eingabe') },
              ]}
            />
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
              <DarkField label={t('crm.name', 'Name')} error={errors.billingAddress?.name}>
                <Input {...register('billingAddress.name')} readOnly={billingLocked} placeholder="z.B. Peter Müller" className={cn(inputCls, billingLocked && lockedCls)} />
              </DarkField>
              <DarkField label={t('crm.sites.careOf', 'c/o')} error={errors.billingAddress?.careOf}>
                <Input {...register('billingAddress.careOf')} readOnly={billingLocked} placeholder="z.B. Test Liegenschaftsverwaltung AG" className={cn(inputCls, billingLocked && lockedCls)} />
              </DarkField>
              <DarkField label={t('crm.street', 'Strasse')} error={errors.billingAddress?.street}>
                <Input {...register('billingAddress.street')} readOnly={billingLocked} className={cn(inputCls, billingLocked && lockedCls)} />
              </DarkField>
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <DarkField label={t('crm.postalCode', 'PLZ')} error={errors.billingAddress?.postalCode}>
                  <Input {...register('billingAddress.postalCode')} readOnly={billingLocked} className={cn(inputCls, billingLocked && lockedCls)} />
                </DarkField>
                <DarkField label={t('crm.city', 'Ort')} error={errors.billingAddress?.city}>
                  <Input {...register('billingAddress.city')} readOnly={billingLocked} className={cn(inputCls, billingLocked && lockedCls)} />
                </DarkField>
              </div>
              <DarkField label={t('crm.canton', 'Kanton')} error={errors.billingAddress?.canton}>
                <Select value={billingCanton || ''} disabled={billingLocked} onValueChange={(v) => setValue('billingAddress.canton', v, { shouldDirty: true })}>
                  <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-72 bg-card border-border">
                    {CH_CANTONS.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-foreground focus:bg-muted/50 focus:text-foreground">{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DarkField>
            </div>

            {/* Ownership (Eigentümerschaft) — feedback #10 */}
            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.sites.ownership', 'Eigentümerschaft')}
            </p>
            <FillModeSwitch
              name={t('crm.sites.ownership', 'Eigentümerschaft')}
              value={ownerMode}
              onChange={setOwnerMode}
              options={[
                ...(customerParty ? [{ value: 'customer', label: t('crm.sites.sameAsCustomer', 'Gleich wie Kunde') }] : []),
                { value: 'billing', label: t('crm.sites.sameAsBilling', 'Gleich wie Rechnungsadresse') },
                { value: 'manual', label: t('crm.sites.manualEntry', 'Manuelle Eingabe') },
              ]}
            />
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
              <DarkField label={t('crm.name', 'Name')} error={errors.ownership?.name}>
                <Input {...register('ownership.name')} readOnly={ownerLocked} placeholder="z.B. Peter Müller" className={cn(inputCls, ownerLocked && lockedCls)} />
              </DarkField>
              <DarkField label={t('crm.sites.careOf', 'c/o')} error={errors.ownership?.careOf}>
                <Input {...register('ownership.careOf')} readOnly={ownerLocked} placeholder="z.B. Test Liegenschaftsverwaltung AG" className={cn(inputCls, ownerLocked && lockedCls)} />
              </DarkField>
              <DarkField label={t('crm.street', 'Strasse')} error={errors.ownership?.street}>
                <Input {...register('ownership.street')} readOnly={ownerLocked} className={cn(inputCls, ownerLocked && lockedCls)} />
              </DarkField>
              <div className="grid grid-cols-[120px_1fr] gap-4">
                <DarkField label={t('crm.postalCode', 'PLZ')} error={errors.ownership?.postalCode}>
                  <Input {...register('ownership.postalCode')} readOnly={ownerLocked} className={cn(inputCls, ownerLocked && lockedCls)} />
                </DarkField>
                <DarkField label={t('crm.city', 'Ort')} error={errors.ownership?.city}>
                  <Input {...register('ownership.city')} readOnly={ownerLocked} className={cn(inputCls, ownerLocked && lockedCls)} />
                </DarkField>
              </div>
              <DarkField label={t('crm.canton', 'Kanton')} error={errors.ownership?.canton}>
                <Select value={ownerCanton || ''} disabled={ownerLocked} onValueChange={(v) => setValue('ownership.canton', v, { shouldDirty: true })}>
                  <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-72 bg-card border-border">
                    {CH_CANTONS.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-foreground focus:bg-muted/50 focus:text-foreground">{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DarkField>
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-linear-to-r from-brand-700 to-brand-600 hover:from-brand-600 hover:to-brand-500 text-white gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.sites.createSite', 'Objekt anlegen')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Segmented radio row that drives how a party block is filled.
 * Options whose source is unavailable (no customer loaded) are left out.
 */
function FillModeSwitch({ value, onChange, options, name }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5 mb-4">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
              active
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5 opacity-40" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DarkField({ label, required, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error.message}
        </p>
      )}
    </div>
  );
}
