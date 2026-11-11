'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Save, IdCard, Cog, Building2, Wallet, ShieldCheck, TriangleAlert, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  VEHICLE_ASSET_TYPES, VEHICLE_FUEL_TYPES, VEHICLE_STATUSES, VEHICLE_METER_UNITS, VEHICLE_TRANSMISSIONS,
  VEHICLE_OWNERSHIP_TYPES, CURRENCIES, ASSET_TYPE_ICONS, toDateInput,
} from '../lib/fleet-meta';

const TEXT = ['kennzeichen', 'label', 'fleetNumber', 'make', 'model', 'vin', 'color', 'department', 'location', 'costCenter', 'provider', 'contractNumber', 'insuranceProvider', 'insurancePolicyNumber'];
const NUMBERS = ['year', 'seats', 'payloadKg', 'powerKw', 'mileageKm', 'nextServiceKm', 'purchasePrice', 'monthlyCost'];
const DATES = ['purchaseDate', 'contractEnd', 'registrationExpiry', 'inspectionDue', 'emissionTestDue', 'insuranceExpiry', 'nextServiceDate'];
const ENUMS = { assetType: 'car', fuelType: 'diesel', status: 'available', meterUnit: 'km', transmission: '', ownershipType: 'owned', currency: 'CHF' };

const emptyForm = () => ({
  ...Object.fromEntries([...TEXT, ...NUMBERS, ...DATES].map((k) => [k, ''])),
  ...ENUMS,
  tags: '',
});

function fromVehicle(v) {
  const form = emptyForm();
  for (const k of TEXT) form[k] = v[k] ?? '';
  for (const k of NUMBERS) form[k] = v[k] != null ? String(v[k]) : '';
  for (const k of DATES) form[k] = toDateInput(v[k]);
  for (const [k, def] of Object.entries(ENUMS)) form[k] = v[k] ?? def;
  form.tags = (v.tags || []).join(', ');
  return form;
}

/** Only fields that changed are sent on edit; empty strings clear a field. */
function toPayload(form, original) {
  const out = {};
  for (const k of TEXT) out[k] = form[k].trim();
  for (const k of NUMBERS) out[k] = form[k] === '' ? null : Number(form[k]);
  for (const k of DATES) out[k] = form[k] || null;
  for (const k of Object.keys(ENUMS)) out[k] = form[k] || null;
  out.tags = form.tags.split(',').map((s) => s.trim()).filter(Boolean);
  if (!original) {
    // Create: leave defaults to the server instead of sending empties.
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && !v.length)));
  }
  const before = toPayload(fromVehicle(original), null);
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify(before[k] ?? (k === 'tags' ? [] : null))));
}

const SECTIONS = [
  { key: 'identity', icon: IdCard },
  { key: 'specs', icon: Cog },
  { key: 'operations', icon: Building2 },
  { key: 'ownership', icon: Wallet },
  { key: 'compliance', icon: ShieldCheck },
];

function Field({ id, label, hint, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground/90">
        {label}{required ? <span className="ms-0.5 text-sky-500">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function VehicleFormDialog({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyForm);
  const [section, setSection] = useState('identity');
  const [error, setError] = useState(null);
  const isEdit = !!defaultValues?._id;

  useEffect(() => {
    if (!open) return;
    setForm(defaultValues ? fromVehicle(defaultValues) : emptyForm());
    setSection('identity');
    setError(null);
  }, [open, defaultValues]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (error) setError(null); };
  const text = (k, props = {}) => (
    <Input id={`vf-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={isLoading} className="h-10 rounded-xl" {...props} />
  );
  const num = (k, props = {}) => text(k, { type: 'number', inputMode: 'decimal', min: 0, ...props });
  const date = (k) => text(k, { type: 'date' });
  const select = (k, values, prefix, { allowEmpty } = {}) => (
    <Select value={form[k] || (allowEmpty ? '__none' : undefined)} onValueChange={(v) => set(k, v === '__none' ? '' : v)} disabled={isLoading}>
      <SelectTrigger id={`vf-${k}`} className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
      <SelectContent>
        {allowEmpty ? <SelectItem value="__none">—</SelectItem> : null}
        {values.map((v) => <SelectItem key={v} value={v}>{prefix ? t(`${prefix}.${v}`, v) : v}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const meterLabel = form.meterUnit === 'h' ? t('fleet.field.hours', 'Operating hours') : t('fleet.field.mileage', 'Mileage');
  const missingPlate = !form.kennzeichen.trim();
  const sectionHasError = useMemo(() => ({ identity: missingPlate && error === 'plate' }), [missingPlate, error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (missingPlate) { setSection('identity'); setError('plate'); return; }
    const payload = toPayload(form, isEdit ? defaultValues : null);
    if (isEdit && !Object.keys(payload).length) { onOpenChange(false); return; }
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || String(err));
      if (/plate|kennzeichen/i.test(err?.message || '')) setSection('identity');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl border-border p-0 sm:max-w-4xl">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-white/10 bg-[#060c18] px-6 pb-5 pt-6 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_-20%,rgba(56,189,248,0.35),transparent_55%),radial-gradient(circle_at_0%_120%,rgba(34,211,238,0.18),transparent_45%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
          <div className="relative flex items-center gap-4 pe-8">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.07]">
              {(() => { const Icon = ASSET_TYPE_ICONS[form.assetType] || ASSET_TYPE_ICONS.other; return <Icon className="size-6 text-sky-200" aria-hidden="true" />; })()}
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-tight text-white">
                {isEdit ? t('fleet.form.editTitle', 'Edit vehicle') : t('fleet.form.createTitle', 'Add vehicle')}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-slate-300">
                {t('fleet.form.desc', 'Only the plate is required — everything else can follow.')}
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col md:flex-row" noValidate>
          {/* Section nav */}
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-2 md:w-56 md:flex-col md:border-b-0 md:border-e md:p-3" aria-label={t('fleet.form.sections', 'Sections')}>
            {SECTIONS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                aria-current={section === key ? 'step' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-medium transition',
                  section === key ? 'bg-card text-foreground shadow-sm ring-1 ring-sky-500/25' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4', section === key ? 'text-sky-500' : '')} aria-hidden="true" />
                <span className="whitespace-nowrap">{t(`fleet.form.section.${key}`, key)}</span>
                {sectionHasError[key] ? <TriangleAlert className="ms-auto size-3.5 text-rose-500" aria-hidden="true" /> : null}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {section === 'identity' && (
              <div className="space-y-5">
                <Field id="vf-assetType" label={t('fleet.field.assetType', 'Type')}>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={t('fleet.field.assetType', 'Type')}>
                    {VEHICLE_ASSET_TYPES.map((type) => {
                      const Icon = ASSET_TYPE_ICONS[type];
                      const active = form.assetType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            set('assetType', type);
                            if (['construction', 'forklift', 'agricultural', 'boat'].includes(type) && !form.mileageKm) set('meterUnit', 'h');
                          }}
                          className={cn(
                            'relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-[11px] font-medium transition',
                            active ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-200' : 'border-border text-muted-foreground hover:border-sky-500/25 hover:text-foreground',
                          )}
                        >
                          {active ? <Check className="absolute end-1.5 top-1.5 size-3 text-sky-500" aria-hidden="true" /> : null}
                          <Icon className="size-5" aria-hidden="true" />
                          <span className="truncate">{t(`fleet.type.${type}`, type)}</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="vf-kennzeichen" label={t('fleet.field.plate', 'Plate / ID')} required hint={t('fleet.form.plateHint', 'License plate or asset ID for unregistered machines.')}>
                    {text('kennzeichen', { placeholder: 'ZH 123 456', autoFocus: !isEdit, 'aria-invalid': error === 'plate' || undefined, className: cn('h-10 rounded-xl font-mono uppercase tracking-wider', error === 'plate' && 'border-rose-500 ring-2 ring-rose-500/20') })}
                  </Field>
                  <Field id="vf-label" label={t('fleet.field.label', 'Name')}>{text('label', { placeholder: t('fleet.form.labelPlaceholder', 'e.g. Service van 1') })}</Field>
                  <Field id="vf-make" label={t('fleet.field.make', 'Make')}>{text('make', { placeholder: 'Volkswagen' })}</Field>
                  <Field id="vf-model" label={t('fleet.field.model', 'Model')}>{text('model', { placeholder: 'Crafter' })}</Field>
                  <Field id="vf-fleetNumber" label={t('fleet.field.fleetNumber', 'Fleet / asset no.')}>{text('fleetNumber', { placeholder: 'F-012' })}</Field>
                  <Field id="vf-status" label={t('fleet.field.status', 'Status')}>{select('status', VEHICLE_STATUSES, 'fleet.status')}</Field>
                </div>
              </div>
            )}

            {section === 'specs' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="vf-fuelType" label={t('fleet.field.fuel', 'Energy')}>{select('fuelType', VEHICLE_FUEL_TYPES, 'fleet.fuel')}</Field>
                <Field id="vf-transmission" label={t('fleet.field.transmission', 'Transmission')}>{select('transmission', VEHICLE_TRANSMISSIONS, 'fleet.transmission', { allowEmpty: true })}</Field>
                <Field id="vf-year" label={t('fleet.field.year', 'Year')}>{num('year', { min: 1950, max: 2100, placeholder: '2022' })}</Field>
                <Field id="vf-color" label={t('fleet.field.color', 'Color')}>{text('color', { placeholder: t('fleet.form.colorPlaceholder', 'White') })}</Field>
                <div className="grid grid-cols-[1fr_110px] gap-2 sm:col-span-2">
                  <Field id="vf-mileageKm" label={meterLabel}>{num('mileageKm', { placeholder: '45000' })}</Field>
                  <Field id="vf-meterUnit" label={t('fleet.field.unit', 'Unit')}>{select('meterUnit', VEHICLE_METER_UNITS, 'fleet.unit')}</Field>
                </div>
                <Field id="vf-vin" label={t('fleet.field.vin', 'VIN / serial no.')} className="sm:col-span-2">{text('vin', { className: 'h-10 rounded-xl font-mono uppercase', maxLength: 40 })}</Field>
                <Field id="vf-seats" label={t('fleet.field.seats', 'Seats')}>{num('seats', { max: 200 })}</Field>
                <Field id="vf-payloadKg" label={t('fleet.field.payload', 'Payload (kg)')}>{num('payloadKg')}</Field>
                <Field id="vf-powerKw" label={t('fleet.field.power', 'Power (kW)')}>{num('powerKw')}</Field>
              </div>
            )}

            {section === 'operations' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="vf-department" label={t('fleet.field.department', 'Department / team')}>{text('department')}</Field>
                <Field id="vf-location" label={t('fleet.field.location', 'Home base / location')}>{text('location')}</Field>
                <Field id="vf-costCenter" label={t('fleet.field.costCenter', 'Cost center')}>{text('costCenter')}</Field>
                <Field id="vf-tags" label={t('fleet.field.tags', 'Tags')} hint={t('fleet.form.tagsHint', 'Comma separated, e.g. pool, cooling, ADR')}>{text('tags')}</Field>
                <Field id="vf-nextServiceDate" label={t('fleet.field.nextServiceDate', 'Next service (date)')}>{date('nextServiceDate')}</Field>
                <Field id="vf-nextServiceKm" label={t('fleet.field.nextServiceMeter', 'Next service at ({unit})', { unit: form.meterUnit })}>{num('nextServiceKm', { placeholder: '60000' })}</Field>
              </div>
            )}

            {section === 'ownership' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="vf-ownershipType" label={t('fleet.field.ownership', 'Ownership')}>{select('ownershipType', VEHICLE_OWNERSHIP_TYPES, 'fleet.ownership')}</Field>
                <Field id="vf-currency" label={t('fleet.field.currency', 'Currency')}>{select('currency', CURRENCIES)}</Field>
                <Field id="vf-purchaseDate" label={t('fleet.field.purchaseDate', 'Acquired on')}>{date('purchaseDate')}</Field>
                <Field id="vf-purchasePrice" label={t('fleet.field.purchasePrice', 'Purchase price')}>{num('purchasePrice', { step: '0.01' })}</Field>
                <Field id="vf-provider" label={t('fleet.field.provider', 'Leasing / rental provider')}>{text('provider')}</Field>
                <Field id="vf-contractNumber" label={t('fleet.field.contractNumber', 'Contract no.')}>{text('contractNumber')}</Field>
                <Field id="vf-monthlyCost" label={t('fleet.field.monthlyCost', 'Monthly rate')}>{num('monthlyCost', { step: '0.01' })}</Field>
                <Field id="vf-contractEnd" label={t('fleet.field.contractEnd', 'Contract ends')}>{date('contractEnd')}</Field>
              </div>
            )}

            {section === 'compliance' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="vf-inspectionDue" label={t('fleet.field.inspectionDue', 'Inspection due (MFK/TÜV/MOT)')}>{date('inspectionDue')}</Field>
                <Field id="vf-emissionTestDue" label={t('fleet.field.emissionTestDue', 'Emission test due')}>{date('emissionTestDue')}</Field>
                <Field id="vf-registrationExpiry" label={t('fleet.field.registrationExpiry', 'Registration expires')}>{date('registrationExpiry')}</Field>
                <Field id="vf-insuranceExpiry" label={t('fleet.field.insuranceExpiry', 'Insurance expires')}>{date('insuranceExpiry')}</Field>
                <Field id="vf-insuranceProvider" label={t('fleet.field.insuranceProvider', 'Insurer')}>{text('insuranceProvider')}</Field>
                <Field id="vf-insurancePolicyNumber" label={t('fleet.field.insurancePolicy', 'Policy no.')}>{text('insurancePolicyNumber')}</Field>
                <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs leading-5 text-muted-foreground sm:col-span-2">
                  {t('fleet.form.complianceHint', 'Dates within 30 days appear under “Needs attention” on the fleet page, and the AI assistant can list them for you.')}
                </p>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="min-h-5 text-sm" aria-live="polite">
            {error ? (
              <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {error === 'plate' ? t('fleet.form.plateRequired', 'A plate or asset ID is required') : error}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" onClick={handleSubmit} className="gap-2 rounded-full px-5" disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEdit ? t('common.save', 'Save') : t('fleet.form.create', 'Create vehicle')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
