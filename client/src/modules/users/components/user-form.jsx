'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createUserSchema } from '@/modules/users/validations/user';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Loader2, User, Mail, Shield, MapPin, Briefcase,
  ChevronLeft, Check, ArrowRight,
} from 'lucide-react';

const STEPS = [
  { id: 'personal', label: 'Persoenlich', icon: User, fields: ['firstName', 'lastName'] },
  { id: 'contact', label: 'Kontakt', icon: Mail, fields: ['email', 'phone'] },
  { id: 'work', label: 'Arbeit', icon: Briefcase, fields: ['department', 'position'] },
  { id: 'address', label: 'Adresse', icon: MapPin, fields: ['street', 'zip', 'city', 'country'] },
  { id: 'access', label: 'Zugang', icon: Shield, fields: ['roleId', 'language'] },
];

export function UserForm({ open, onOpenChange, onSubmit, defaultValues, roles = [], isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const defaultRoleId = roles.find((r) => r.name === 'User')?._id || '';
  const [currentStep, setCurrentStep] = useState(0);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors }, trigger } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '', lastName: '', email: '', phone: '',
      department: '', position: '',
      street: '', city: '', zip: '', country: 'Schweiz',
      roleId: defaultRoleId, language: 'de',
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (open) setCurrentStep(0);
    if (defaultValues) {
      reset({
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        email: defaultValues.email || '',
        phone: defaultValues.phone || '',
        department: defaultValues.department || '',
        position: defaultValues.position || '',
        street: defaultValues.street || '',
        city: defaultValues.city || '',
        zip: defaultValues.zip || '',
        country: defaultValues.country || 'Schweiz',
        roleId: defaultValues.role?._id || defaultValues.roleId || '',
        language: defaultValues.language || 'de',
      });
    } else {
      reset({
        firstName: '', lastName: '', email: '', phone: '',
        department: '', position: '',
        street: '', city: '', zip: '', country: 'Schweiz',
        roleId: defaultRoleId, language: 'de',
      });
    }
  }, [defaultValues, reset, defaultRoleId, open]);

  const handleFormSubmit = (data) => {
    // Guard: only actually submit on the final step
    if (currentStep < STEPS.length - 1) {
      return;
    }
    onSubmit(data);
    onOpenChange(false);
    reset();
  };

  const goNext = async () => {
    const stepFields = STEPS[currentStep].fields;
    const valid = await trigger(stepFields);
    if (valid) setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const isLastStep = currentStep === STEPS.length - 1;
  const step = STEPS[currentStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg font-bold">
            {isEdit ? t('users.editUser') : t('users.newUser')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit
              ? (t('users.editDesc') || 'Benutzerinformationen bearbeiten.')
              : (t('users.createDesc') || 'Neuen Benutzer erstellen. Eine Aktivierungs-E-Mail wird gesendet.')
            }
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              const StepIcon = s.icon;
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => i < currentStep && setCurrentStep(i)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg transition-all w-full',
                      isCurrent && 'bg-primary/10 text-primary',
                      isCompleted && 'text-emerald-600 cursor-pointer hover:bg-emerald-500/5',
                      !isCurrent && !isCompleted && 'text-muted-foreground/50',
                    )}
                    disabled={i > currentStep}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all',
                      isCurrent && 'bg-primary text-primary-foreground shadow-sm shadow-primary/30',
                      isCompleted && 'bg-emerald-500 text-white',
                      !isCurrent && !isCompleted && 'bg-muted text-muted-foreground/50',
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:block truncate">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      'h-px w-4 shrink-0 mx-0.5',
                      i < currentStep ? 'bg-emerald-500' : 'bg-border',
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="shrink-0" />

        {/* Form content */}
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && currentStep < STEPS.length - 1 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className="px-6 py-6 flex-1 min-h-0 overflow-y-auto">
            {/* Step header */}
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center">
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{step.label}</h3>
                <p className="text-xs text-muted-foreground">Schritt {currentStep + 1} von {STEPS.length}</p>
              </div>
            </div>

            {/* Step 1: Personal */}
            {currentStep === 0 && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.firstName')} error={errors.firstName?.message} required>
                  <Input placeholder="Max" {...register('firstName')} autoFocus />
                </FormField>
                <FormField label={t('users.lastName')} error={errors.lastName?.message} required>
                  <Input placeholder="Muster" {...register('lastName')} />
                </FormField>
              </div>
            )}

            {/* Step 2: Contact */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.email')} error={errors.email?.message} required>
                  <Input type="email" placeholder="max.muster@mbboiler.ch" {...register('email')} autoFocus />
                </FormField>
                <FormField label={`${t('users.phone')} (optional)`}>
                  <Input placeholder="+41 79 123 45 67" {...register('phone')} />
                </FormField>
              </div>
            )}

            {/* Step 3: Work */}
            {currentStep === 2 && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.department') || 'Abteilung'}>
                  <Input placeholder={t('users.departmentPlaceholder') || 'z.B. Technik'} {...register('department')} autoFocus />
                </FormField>
                <FormField label={t('users.position') || 'Position'}>
                  <Input placeholder={t('users.positionPlaceholder') || 'z.B. Projektleiter'} {...register('position')} />
                </FormField>
              </div>
            )}

            {/* Step 4: Address */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.street') || 'Strasse'}>
                  <Input placeholder="Musterstrasse 1" {...register('street')} autoFocus />
                </FormField>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label={t('users.zip') || 'PLZ'}>
                    <Input placeholder="3000" {...register('zip')} />
                  </FormField>
                  <FormField label={t('users.city') || 'Ort'} className="col-span-2">
                    <Input placeholder="Bern" {...register('city')} />
                  </FormField>
                </div>
                <FormField label={t('users.country') || 'Land'}>
                  <Input placeholder="Schweiz" {...register('country')} />
                </FormField>
              </div>
            )}

            {/* Step 5: Access */}
            {currentStep === 4 && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.role')} error={errors.roleId?.message} required>
                  <Select value={watch('roleId')} onValueChange={(val) => setValue('roleId', val)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role._id} value={role._id}>{role.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t('users.language')}>
                  <Select value={watch('language')} onValueChange={(val) => setValue('language', val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="fr">Francais</SelectItem>
                      <SelectItem value="it">Italiano</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            )}
          </div>

          <Separator className="shrink-0" />

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-muted/40 border-t border-border/60 rounded-b-2xl">
            <div>
              {currentStep > 0 ? (
                <Button type="button" variant="ghost" className="gap-1.5 rounded-lg h-9" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                  Zurueck
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="rounded-lg h-9" onClick={() => onOpenChange(false)}>
                  {t('users.cancel')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Progress dots */}
              <div className="flex items-center gap-1 mr-2">
                {STEPS.map((_, i) => (
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
                <Button type="submit" className="rounded-lg h-9 px-5 gap-1.5 shadow-sm" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? t('users.save') : t('users.create')}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="rounded-lg h-9 px-5 gap-1.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    goNext();
                  }}
                >
                  Weiter
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

