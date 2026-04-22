'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Loader2, User, Building2, Mail, MapPin, Bell,
  ChevronLeft, Check, ArrowRight,
} from 'lucide-react';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { DuplicateWarning } from './duplicate-warning';

const STEPS = [
  { id: 'basic', icon: User, fields: ['name', 'type'] },
  { id: 'contact', icon: Mail, fields: ['phone', 'mobile', 'email', 'website'] },
  { id: 'address', icon: MapPin, fields: ['street', 'postalCode', 'city', 'canton', 'country'] },
  { id: 'preferences', icon: Bell, fields: ['newsletterOptIn', 'newsletterChannel', 'notes'] },
];

const BLANK_VALUES = {
  name: '',
  type: 'private',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  street: '',
  postalCode: '',
  city: '',
  canton: '',
  country: 'CH',
  newsletterOptIn: false,
  newsletterChannel: 'email',
  notes: '',
};

export function CustomerForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage(); // global t supports t(key, fallback)
  const isEdit = !!defaultValues?._id;
  const [currentStep, setCurrentStep] = useState(0);

  const stepMeta = useMemo(() => [
    { id: 'basic', label: t('crm.stepBasic', 'Basis'), icon: User },
    { id: 'contact', label: t('crm.stepContact', 'Kontakt'), icon: Mail },
    { id: 'address', label: t('crm.stepAddress', 'Adresse'), icon: MapPin },
    { id: 'preferences', label: t('crm.stepPreferences', 'Einstellungen'), icon: Bell },
  ], [t]);

  const { register, handleSubmit, reset, setValue, watch, trigger, formState: { errors } } = useForm({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: BLANK_VALUES,
  });

  useEffect(() => {
    if (open) setCurrentStep(0);
    if (defaultValues) {
      reset({
        ...BLANK_VALUES,
        ...defaultValues,
        // normalise undefined to empty strings so inputs are controlled
        name: defaultValues.name || '',
        type: defaultValues.type || 'private',
        phone: defaultValues.phone || '',
        mobile: defaultValues.mobile || '',
        email: defaultValues.email || '',
        website: defaultValues.website || '',
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

  const watchedName = watch('name');
  const watchedPlz = watch('postalCode');
  const debouncedName = useDebounce(watchedName, 400);
  const debouncedPlz = useDebounce(watchedPlz, 400);

  // Duplicate detection — only runs on create (not edit) and only when name is at
  // least 3 chars. We include the postalCode so matches are narrower once known.
  const dupesEnabled = !isEdit && open && !!debouncedName && debouncedName.trim().length >= 3;
  const { data: dupesData } = useQuery({
    queryKey: queryKeys.crm.customers.duplicates({ name: debouncedName, postalCode: debouncedPlz }),
    queryFn: () => customerService.findDuplicates({ name: debouncedName, postalCode: debouncedPlz }),
    enabled: dupesEnabled,
    staleTime: 30_000,
  });

  const handleFormSubmit = async (data) => {
    // Guard: only real-submit on the last step
    if (currentStep < STEPS.length - 1) return;
    try {
      await onSubmit(data);
      // Only close the modal and reset the form once the server confirms success.
      onOpenChange(false);
      reset(BLANK_VALUES);
    } catch {
      // Keep modal open so the user can fix & retry.
      // An error toast is already emitted by the parent's mutation onError.
    }
  };

  const goNext = async () => {
    const valid = await trigger(STEPS[currentStep].fields);
    if (valid) setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const isLastStep = currentStep === STEPS.length - 1;
  const typeVal = watch('type');
  const newsletterOptIn = watch('newsletterOptIn');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg font-bold">
            {isEdit ? t('crm.editCustomer', 'Kunde bearbeiten') : t('crm.newCustomer', 'Neuer Kunde')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('crm.editDesc', 'Passen Sie die Kundeninformationen an.')
              : t('crm.createDesc', 'Erstellen Sie einen neuen Kunden.')}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pb-4 shrink-0">
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
                      isCurrent && 'bg-primary/10 text-primary',
                      isCompleted && 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10',
                      !isCurrent && !isCompleted && 'text-muted-foreground',
                    )}
                  >
                    <div className={cn(
                      'h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors',
                      isCompleted
                        ? 'bg-emerald-500/20'
                        : isCurrent
                        ? 'bg-primary/15'
                        : 'bg-muted',
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                    </div>
                    <span className="hidden sm:inline truncate">{s.label}</span>
                  </button>
                  {i < stepMeta.length - 1 && (
                    <div className={cn(
                      'h-px w-4 sm:w-6 transition-colors shrink-0',
                      isCompleted ? 'bg-emerald-500' : 'bg-border',
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="shrink-0" />

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
            {/* Duplicate warning (create mode only, top of any step once matches found) */}
            {!isEdit && dupesData?.hasDuplicates && (
              <DuplicateWarning
                title={t('crm.duplicateWarningTitle', 'Moegliche Duplikate gefunden')}
                description={t('crm.duplicateWarningDesc', 'Kunden mit aehnlichem Namen existieren bereits:')}
                duplicates={dupesData.duplicates || []}
                onDismiss={() => onOpenChange(false)}
                className="mb-6"
              />
            )}

            {/* ── Step 1: Basic ── */}
            {currentStep === 0 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('crm.stepBasic', 'Basis')}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t('crm.basicHint', 'Name und Kundentyp')}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">
                    {t('crm.name', 'Name')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder={t('crm.namePlaceholder', 'z.B. Muster GmbH')}
                    autoFocus
                    {...register('name')}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {t('crm.type', 'Typ')} <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setValue('type', 'private', { shouldValidate: true })}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                        typeVal === 'private'
                          ? 'border-blue-500/60 bg-blue-500/5 ring-1 ring-blue-500/30'
                          : 'border-border hover:border-border hover:bg-muted/50',
                      )}
                    >
                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{t('crm.typePrivate', 'Privat')}</p>
                        <p className="text-xs text-muted-foreground">Privatperson / Haushalt</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('type', 'business', { shouldValidate: true })}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                        typeVal === 'business'
                          ? 'border-emerald-500/60 bg-emerald-500/5 ring-1 ring-emerald-500/30'
                          : 'border-border hover:border-border hover:bg-muted/50',
                      )}
                    >
                      <div className="h-10 w-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{t('crm.typeBusiness', 'Firma')}</p>
                        <p className="text-xs text-muted-foreground">Unternehmen / Verwaltung</p>
                      </div>
                    </button>
                  </div>
                  {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
                </div>
              </div>
            )}

            {/* ── Step 2: Contact ── */}
            {currentStep === 1 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center ring-1 ring-sky-500/20">
                    <Mail className="h-4 w-4 text-sky-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('crm.stepContact', 'Kontakt')}</h3>
                    <p className="text-xs text-muted-foreground">Telefon, E-Mail und Website</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={t('crm.phone', 'Telefon')} error={errors.phone}>
                    <Input placeholder="+41 44 123 45 67" {...register('phone')} />
                  </Field>
                  <Field label={t('crm.mobile', 'Mobil')} error={errors.mobile}>
                    <Input placeholder="+41 79 123 45 67" {...register('mobile')} />
                  </Field>
                </div>

                <Field label={t('crm.email', 'E-Mail')} error={errors.email}>
                  <Input type="email" placeholder="info@example.ch" autoFocus {...register('email')} />
                </Field>
                <Field label={t('crm.website', 'Website')} error={errors.website}>
                  <Input type="url" placeholder="https://www.example.ch" {...register('website')} />
                </Field>
              </div>
            )}

            {/* ── Step 3: Address ── */}
            {currentStep === 2 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                    <MapPin className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('crm.stepAddress', 'Adresse')}</h3>
                    <p className="text-xs text-muted-foreground">Rechnungsadresse des Kunden</p>
                  </div>
                </div>

                <Field label={t('crm.street', 'Strasse')} error={errors.street}>
                  <Input placeholder="Musterstrasse 1" autoFocus {...register('street')} />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_150px] gap-4">
                  <Field label={t('crm.postalCode', 'PLZ')} error={errors.postalCode}>
                    <Input placeholder="8000" {...register('postalCode')} />
                  </Field>
                  <Field label={t('crm.city', 'Ort')} error={errors.city}>
                    <Input placeholder="Zuerich" {...register('city')} />
                  </Field>
                  <Field label={t('crm.canton', 'Kanton')} error={errors.canton}>
                    <Select
                      value={watch('canton') || ''}
                      onValueChange={(v) => setValue('canton', v, { shouldValidate: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4}>
                        {CH_CANTONS.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field
                  label={`${t('crm.country', 'Land')} (ISO-2, z.B. CH, DE, AT)`}
                  error={errors.country}
                >
                  <Input placeholder="CH" maxLength={2} {...register('country')} />
                </Field>
              </div>
            )}

            {/* ── Step 4: Preferences ── */}
            {currentStep === 3 && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                    <Bell className="h-4 w-4 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('crm.stepPreferences', 'Einstellungen')}</h3>
                    <p className="text-xs text-muted-foreground">Newsletter und Notizen</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t('crm.newsletterOptIn', 'Newsletter abonniert')}</p>
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
                      <Label className="text-xs font-medium mb-1.5 block">
                        {t('crm.newsletterChannel', 'Kanal')}
                      </Label>
                      <Select
                        value={watch('newsletterChannel') || 'email'}
                        onValueChange={(v) => setValue('newsletterChannel', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          <SelectItem value="email">{t('crm.channelEmail', 'E-Mail')}</SelectItem>
                          <SelectItem value="whatsapp">{t('crm.channelWhatsapp', 'WhatsApp')}</SelectItem>
                          <SelectItem value="both">{t('crm.channelBoth', 'Beide')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Field label={t('crm.notes', 'Notizen')} error={errors.notes}>
                  <Textarea
                    rows={4}
                    placeholder={t('crm.notesPlaceholder', 'Allgemeine Notizen zum Kunden...')}
                    className="resize-none"
                    {...register('notes')}
                  />
                </Field>
              </div>
            )}
          </div>

          <Separator className="shrink-0" />

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-muted/20">
            <div className="flex items-center gap-2">
              {currentStep > 0 ? (
                <Button type="button" variant="ghost" className="gap-1.5 h-9" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('common.back', 'Zurueck')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="h-9" onClick={() => onOpenChange(false)}>
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
                      i === currentStep ? 'w-4 bg-primary' : i < currentStep ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-border',
                    )}
                  />
                ))}
              </div>

              {isLastStep ? (
                <Button type="submit" className="h-9 gap-1.5 shadow-theme-sm" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-9 gap-1.5"
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

function Field({ label, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
          {error.message}
        </p>
      )}
    </div>
  );
}
