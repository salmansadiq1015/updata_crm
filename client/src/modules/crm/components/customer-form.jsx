'use client';

import { useEffect, useState, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '@/lib/i18n/language-context';
import { createCustomerSchema } from '@/modules/crm/validations/customer';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { AiVoiceCapture } from '@/modules/ai';
import { SESSION_TYPES } from '@/modules/ai';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Loader2, User, Building2, Mail, MapPin, Bell,
  ChevronLeft, Check, ArrowRight, AlertCircle,
} from 'lucide-react';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { DuplicateWarning } from './duplicate-warning';

const STEPS = [
  { id: 'basic', icon: User, fields: ['name', 'type', 'ownerName', 'uidNumber'] },
  { id: 'contact', icon: Mail, fields: ['phone', 'mobile', 'email', 'website'] },
  { id: 'address', icon: MapPin, fields: ['street', 'postalCode', 'city', 'canton', 'country'] },
  { id: 'preferences', icon: Bell, fields: ['newsletterOptIn', 'newsletterChannel', 'notes'] },
];

const BLANK_VALUES = {
  name: '',
  ownerName: '',
  type: 'private',
  salutation: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  uidNumber: '',
  vatNumber: '',
  street: '',
  postalCode: '',
  city: '',
  canton: '',
  country: 'CH',
  newsletterOptIn: false,
  newsletterChannel: 'email',
  notes: '',
};

// Anrede / salutation (client feedback #1). '__none__' = "none" (shadcn Select forbids an empty-string value).
const SALUTATIONS = [
  { value: '__none__', label: '(keine)' },
  { value: 'herr', label: 'Herr' },
  { value: 'frau', label: 'Frau' },
  { value: 'familie', label: 'Familie' },
  { value: 'firma', label: 'Firma' },
  { value: 'herr_frau', label: 'Herr und Frau' },
  { value: 'frau_herr', label: 'Frau und Herr' },
];

export function CustomerForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const [currentStep, setCurrentStep] = useState(0);

  const stepMeta = useMemo(() => [
    { id: 'basic', label: t('crm.stepBasic', 'Basis'), icon: User },
    { id: 'contact', label: t('crm.stepContact', 'Kontakt'), icon: Mail },
    { id: 'address', label: t('crm.stepAddress', 'Adresse'), icon: MapPin },
    { id: 'preferences', label: t('crm.stepPreferences', 'Einstellungen'), icon: Bell },
  ], [t]);

  const { register, handleSubmit, reset, setValue, trigger, control, formState: { errors } } = useForm({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: BLANK_VALUES,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK_VALUES,
        ...defaultValues,
        name: defaultValues.name || '',
        ownerName: defaultValues.ownerName || '',
        salutation: defaultValues.salutation || '',
        type: defaultValues.type || 'private',
        phone: defaultValues.phone || '',
        mobile: defaultValues.mobile || '',
        email: defaultValues.email || '',
        website: defaultValues.website || '',
        uidNumber: defaultValues.uidNumber || '',
        vatNumber: defaultValues.vatNumber || '',
        street: defaultValues.street || '',
        postalCode: defaultValues.postalCode || '',
        city: defaultValues.city || '',
        canton: defaultValues.canton || '',
        country: defaultValues.country || 'CH',
        newsletterOptIn: !!defaultValues.newsletterOptIn,
        newsletterChannel: defaultValues.newsletterChannel || 'email',
        notes: defaultValues.notes || '',
      });
    } else {
      reset(BLANK_VALUES);
    }
  }, [defaultValues, reset, open]);

  const watchedName = useWatch({ control, name: 'name' });
  const watchedPlz = useWatch({ control, name: 'postalCode' });
  const typeVal = useWatch({ control, name: 'type' });
  const selectedSalutation = useWatch({ control, name: 'salutation' });
  const newsletterOptIn = useWatch({ control, name: 'newsletterOptIn' });
  const selectedCanton = useWatch({ control, name: 'canton' });
  const newsletterChannel = useWatch({ control, name: 'newsletterChannel' });
  const debouncedName = useDebounce(watchedName, 400);
  const debouncedPlz = useDebounce(watchedPlz, 400);

  const dupesEnabled = !isEdit && open && !!debouncedName && debouncedName.trim().length >= 3;
  const { data: dupesData } = useQuery({
    queryKey: queryKeys.crm.customers.duplicates({ name: debouncedName, postalCode: debouncedPlz }),
    queryFn: () => customerService.findDuplicates({ name: debouncedName, postalCode: debouncedPlz }),
    enabled: dupesEnabled,
    staleTime: 30_000,
  });

  const handleFormSubmit = async (data) => {
    if (currentStep < STEPS.length - 1) return;
    try {
      await onSubmit(data);
      handleOpenChange(false);
      reset(BLANK_VALUES);
    } catch {
      // Keep modal open so the user can fix & retry.
    }
  };

  const goNext = async () => {
    const valid = await trigger(STEPS[currentStep].fields);
    if (valid) setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const isLastStep = currentStep === STEPS.length - 1;
  const isBusiness = typeVal === 'business';
  const voiceCustomerId = defaultValues?._id || null;
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) setCurrentStep(0);
    onOpenChange(nextOpen);
  };
  const selectCustomerType = (nextType) => {
    setValue('type', nextType, { shouldValidate: true, shouldDirty: true });
    if (nextType !== 'business') {
      setValue('ownerName', '', { shouldValidate: true, shouldDirty: true });
      setValue('uidNumber', '', { shouldValidate: true, shouldDirty: true });
      setValue('vatNumber', '', { shouldValidate: false, shouldDirty: true });
    }
  };

  const inputCls = 'bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20';
  const selectTriggerCls = 'bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground focus:border-violet-500/50 focus:ring-violet-500/20';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden rounded-2xl max-h-[92vh] flex flex-col border border-border bg-card shadow-2xl">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 shrink-0">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit ? t('crm.editCustomer', 'Kunde bearbeiten') : t('crm.newCustomer', 'Neuer Kunde')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {isEdit
                  ? t('crm.editDesc', 'Passen Sie die Kundeninformationen an.')
                  : t('crm.createDesc', 'Erstellen Sie einen neuen Kunden.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 py-4 shrink-0 border-b border-border">
          <div className="flex items-center gap-2">
            {stepMeta.map((s, i) => {
              const StepIcon = s.icon;
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;

              return (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <button
                    type="button"
                    onClick={() => i < currentStep && setCurrentStep(i)}
                    disabled={i > currentStep}
                    className={cn(
                      'flex items-center gap-2 h-9 px-3 rounded-lg transition-all text-xs font-semibold flex-1 min-w-0',
                      isCurrent && 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
                      isCompleted && 'text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400',
                      !isCurrent && !isCompleted && 'text-muted-foreground/60',
                    )}
                  >
                    <div className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors',
                      isCompleted
                        ? 'bg-emerald-500/20'
                        : isCurrent
                        ? 'bg-blue-500/15'
                        : 'bg-muted',
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                    </div>
                    <span className="hidden sm:inline truncate">{s.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && currentStep < STEPS.length - 1 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          {/* Step content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 scrollbar-thin">
            {/* Duplicate warning */}
            {!isEdit && dupesData?.hasDuplicates && (
              <DuplicateWarning
                title={t('crm.duplicateWarningTitle', 'Moegliche Duplikate gefunden')}
                description={t('crm.duplicateWarningDesc', 'Kunden mit aehnlichem Namen existieren bereits:')}
                duplicates={dupesData.duplicates || []}
                onDismiss={() => handleOpenChange(false)}
                className="mb-6"
              />
            )}

            {/* ── Step 1: Basic ── */}
            {currentStep === 0 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
                    <User className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('crm.stepBasic', 'Basis')}</h3>
                    <p className="text-xs text-muted-foreground">{t('crm.basicHint', 'Name und Kundentyp')}</p>
                  </div>
                </div>

                <DarkField label={t('crm.salutation', 'Anrede')} error={errors.salutation}>
                  <Select
                    value={selectedSalutation ? selectedSalutation : '__none__'}
                    onValueChange={(v) => setValue('salutation', v === '__none__' ? '' : v, { shouldValidate: true })}
                  >
                    <SelectTrigger className={selectTriggerCls}>
                      <SelectValue placeholder="(keine)" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
                      {SALUTATIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-foreground focus:bg-muted/60 focus:text-foreground">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DarkField>

                <DarkField label={isBusiness ? t('crm.companyName', 'Firmenname') : t('crm.name', 'Name')} required error={errors.name}>
                  <Input
                    id="name"
                    placeholder={isBusiness ? t('crm.companyNamePlaceholder', 'z.B. Muster GmbH') : t('crm.namePlaceholder', 'z.B. Max Muster')}
                    autoFocus
                    {...register('name')}
                    className={inputCls}
                  />
                </DarkField>

                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                    {t('crm.type', 'Typ')} <span className="text-red-400">*</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => selectCustomerType('private')}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                        typeVal === 'private'
                          ? 'border-blue-500/60 bg-blue-500/8 ring-1 ring-blue-500/30'
                          : 'border-border bg-muted/30 hover:border-border hover:bg-muted/50',
                      )}
                    >
                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-blue-700 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{t('crm.typePrivate', 'Privat')}</p>
                        <p className="text-xs text-muted-foreground">Privatperson / Haushalt</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCustomerType('business')}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-4 text-left transition-all',
                        typeVal === 'business'
                          ? 'border-emerald-500/60 bg-emerald-500/8 ring-1 ring-emerald-500/30'
                          : 'border-border bg-muted/30 hover:border-border hover:bg-muted/50',
                      )}
                    >
                      <div className="h-10 w-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{t('crm.typeBusiness', 'Firma')}</p>
                        <p className="text-xs text-muted-foreground">Unternehmen / Verwaltung</p>
                      </div>
                    </button>
                  </div>
                  {errors.type && (
                    <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {errors.type.message}
                    </p>
                  )}
                </div>

                {isBusiness && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                    <DarkField label={t('crm.ownerName', 'Inhabername')} required error={errors.ownerName}>
                      <Input
                        placeholder={t('crm.ownerNamePlaceholder', 'z.B. Max Muster')}
                        {...register('ownerName')}
                        className={inputCls}
                      />
                    </DarkField>
                    <DarkField label={t('crm.uidNumber', 'UID Nummer')} required error={errors.uidNumber}>
                      <Input
                        placeholder={t('crm.uidNumberPlaceholder', 'z.B. CHE-123.456.789')}
                        {...register('uidNumber')}
                        className={inputCls}
                      />
                    </DarkField>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Contact ── */}
            {currentStep === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center ring-1 ring-sky-500/20">
                    <Mail className="h-4 w-4 text-sky-700 dark:text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('crm.stepContact', 'Kontakt')}</h3>
                    <p className="text-xs text-muted-foreground">Telefon, E-Mail und Website</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DarkField label={t('crm.phone', 'Telefon')} error={errors.phone}>
                    <Input placeholder="+41 44 123 45 67" {...register('phone')} className={inputCls} />
                  </DarkField>
                  <DarkField label={t('crm.mobile', 'Mobil')} error={errors.mobile}>
                    <Input placeholder="+41 79 123 45 67" {...register('mobile')} className={inputCls} />
                  </DarkField>
                </div>

                <DarkField label={t('crm.email', 'E-Mail')} error={errors.email}>
                  <Input type="email" placeholder="info@example.ch" autoFocus {...register('email')} className={inputCls} />
                </DarkField>
                <DarkField label={t('crm.website', 'Website')} error={errors.website}>
                  <Input type="url" placeholder="https://www.example.ch" {...register('website')} className={inputCls} />
                </DarkField>
              </div>
            )}

            {/* ── Step 3: Address ── */}
            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                    <MapPin className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('crm.stepAddress', 'Adresse')}</h3>
                    <p className="text-xs text-muted-foreground">Rechnungsadresse des Kunden</p>
                  </div>
                </div>

                <DarkField label={t('crm.street', 'Strasse')} error={errors.street}>
                  <Input placeholder="Musterstrasse 1" autoFocus {...register('street')} className={inputCls} />
                </DarkField>

                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_150px] gap-4">
                  <DarkField label={t('crm.postalCode', 'PLZ')} error={errors.postalCode}>
                    <Input placeholder="8000" {...register('postalCode')} className={inputCls} />
                  </DarkField>
                  <DarkField label={t('crm.city', 'Ort')} error={errors.city}>
                    <Input placeholder="Zuerich" {...register('city')} className={inputCls} />
                  </DarkField>
                  <DarkField label={t('crm.canton', 'Kanton')} error={errors.canton}>
                    <Select
                      value={selectedCanton || ''}
                      onValueChange={(v) => setValue('canton', v, { shouldValidate: true })}
                    >
                      <SelectTrigger className={selectTriggerCls}>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
                        {CH_CANTONS.map((c) => (
                          <SelectItem key={c.code} value={c.code} className="text-foreground focus:bg-muted/60 focus:text-foreground">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DarkField>
                </div>

                {voiceCustomerId && (
                  <AiVoiceCapture
                    compact
                    sessionType={SESSION_TYPES.ADDRESS_CAPTURE}
                    contextModule="crm"
                    contextRecordType="customer"
                    contextRecordId={voiceCustomerId}
                    onComplete={(session) => {
                      const parsed = session?.result?.parsed;
                      if (!parsed) return;
                      setValue('street', parsed.street || '', { shouldDirty: true, shouldValidate: true });
                      setValue('postalCode', parsed.postalCode || '', { shouldDirty: true, shouldValidate: true });
                      setValue('city', parsed.city || '', { shouldDirty: true, shouldValidate: true });
                      setValue('canton', parsed.canton || '', { shouldDirty: true, shouldValidate: true });
                      setValue('country', parsed.country || 'CH', { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                )}

                {/* Country field hidden — business is 100% CH; value stays registered as CH (client feedback #2) */}
                <input type="hidden" {...register('country')} />
              </div>
            )}

            {/* ── Step 4: Preferences ── */}
            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                    <Bell className="h-4 w-4 text-violet-700 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{t('crm.stepPreferences', 'Einstellungen')}</h3>
                    <p className="text-xs text-muted-foreground">Newsletter und Notizen</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{t('crm.newsletterOptIn', 'Newsletter abonniert')}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Einwilligung zum Erhalt von Newslettern und Marketing.
                      </p>
                    </div>
                    <Switch
                      checked={!!newsletterOptIn}
                      onCheckedChange={(v) => setValue('newsletterOptIn', v)}
                    />
                  </div>

                  {newsletterOptIn && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <Label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
                        {t('crm.newsletterChannel', 'Kanal')}
                      </Label>
                      <Select
                        value={newsletterChannel || 'email'}
                        onValueChange={(v) => setValue('newsletterChannel', v)}
                      >
                        <SelectTrigger className={selectTriggerCls}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="bg-card border-border">
                          <SelectItem value="email" className="text-foreground focus:bg-muted/60">{t('crm.channelEmail', 'E-Mail')}</SelectItem>
                          <SelectItem value="whatsapp" className="text-foreground focus:bg-muted/60">{t('crm.channelWhatsapp', 'WhatsApp')}</SelectItem>
                          <SelectItem value="both" className="text-foreground focus:bg-muted/60">{t('crm.channelBoth', 'Beide')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <DarkField label={t('crm.notes', 'Notizen')} error={errors.notes}>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <RichTextEditor
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('crm.notesPlaceholder', 'Allgemeine Notizen zum Kunden...')}
                        maxLength={5000}
                        minHeight={120}
                        error={errors.notes}
                      />
                    )}
                  />
                </DarkField>
              </div>
            )}
          </div>

          <Separator className="shrink-0 bg-border" />

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0">
            <div className="flex items-center gap-2">
              {currentStep > 0 ? (
                <Button type="button" variant="ghost" className="gap-1.5 h-9 text-muted-foreground hover:text-foreground hover:bg-muted/60" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('common.back', 'Zurueck')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="h-9 text-muted-foreground hover:text-foreground hover:bg-muted/60" onClick={() => handleOpenChange(false)}>
                  {t('common.cancel', 'Abbrechen')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 mr-2">
                {stepMeta.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === currentStep ? 'w-4 bg-blue-500' : i < currentStep ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-border',
                    )}
                  />
                ))}
              </div>

              {isLastStep ? (
                <Button
                  type="submit"
                  className="h-9 gap-1.5 bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-9 gap-1.5 bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goNext();
                  }}
                >
                  {t('common.next', 'Weiter')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
