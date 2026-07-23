'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
  DEPARTMENT_POSITION_PRESETS,
  getPositionPreset,
  getPositionPresets,
  getRoleByPresetName,
} from '@/modules/users/constants/department-position-presets';
import { getPresetDisplayLabel, getUserRoleLabel } from '@/modules/users/utils/user-display';
import { getPreferredDepartmentId } from '@/modules/users/utils/project-assignment';
import {
  Loader2, User, Mail, Shield, MapPin, Briefcase,
  ChevronLeft, Check, ArrowRight, AlertTriangle, ShieldCheck,
} from 'lucide-react';

const EMPTY_TEAM_VALUE = '__none';
const SALUTATION_NONE = '__none_salutation';

// Comma-separated skills/certifications text -> trimmed, de-duplicated array.
function splitCapabilities(value) {
  if (!value) return [];
  return [...new Set(String(value).split(',').map((v) => v.trim()).filter(Boolean))];
}

const STEPS = [
  { id: 'personal', labelKey: 'users.step.personal', fallback: 'Persönlich', icon: User, fields: ['firstName', 'lastName'] },
  { id: 'contact', labelKey: 'users.step.contact', fallback: 'Kontakt', icon: Mail, fields: ['email', 'phone'] },
  { id: 'work', labelKey: 'users.step.work', fallback: 'Arbeit', icon: Briefcase, fields: ['department', 'position', 'preferredDepartmentId'] },
  { id: 'address', labelKey: 'users.step.address', fallback: 'Adresse', icon: MapPin, fields: ['street', 'addressSupplement', 'zip', 'city', 'country'] },
  { id: 'access', labelKey: 'users.step.access', fallback: 'Zugang', icon: Shield, fields: ['roleId', 'language'] },
];

function getStepLabel(step, t) {
  return t(step.labelKey, step.fallback);
}

export function UserForm({ open, onOpenChange, onSubmit, defaultValues, roles = [], assignmentTargets = [], isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const defaultRoleId = roles.find((r) => r.name === 'User')?._id || '';
  const [currentStep, setCurrentStep] = useState(0);
  const [pendingPresetRoleName, setPendingPresetRoleName] = useState(null);

  const { register, handleSubmit, reset, setValue, getValues, control, formState: { errors }, trigger } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '', lastName: '', salutation: '', email: '', phone: '',
      department: '', position: '', skills: '', certifications: '',
      street: '', addressSupplement: '', city: '', zip: '', country: 'Schweiz',
      roleId: defaultRoleId, language: 'de', preferredDepartmentId: null,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        salutation: defaultValues.salutation || '',
        email: defaultValues.email || '',
        phone: defaultValues.phone || '',
        department: defaultValues.department || '',
        position: defaultValues.position || '',
        street: defaultValues.street || '',
        addressSupplement: defaultValues.addressSupplement || '',
        city: defaultValues.city || '',
        zip: defaultValues.zip || '',
        country: defaultValues.country || 'Schweiz',
        skills: (defaultValues.schedulingSkills || []).join(', '),
        certifications: (defaultValues.schedulingCertifications || []).join(', '),
        roleId: defaultValues.role?._id || defaultValues.roleId || '',
        preferredDepartmentId: getPreferredDepartmentId(defaultValues),
        language: defaultValues.language || 'de',
      });
    } else {
      reset({
        firstName: '', lastName: '', salutation: '', email: '', phone: '',
        department: '', position: '', skills: '', certifications: '',
        street: '', addressSupplement: '', city: '', zip: '', country: 'Schweiz',
        roleId: defaultRoleId, language: 'de', preferredDepartmentId: null,
      });
    }
  }, [defaultValues, reset, defaultRoleId, open]);

  const selectedSalutation = useWatch({ control, name: 'salutation' });
  const selectedDepartment = useWatch({ control, name: 'department' });
  const selectedPosition = useWatch({ control, name: 'position' });
  const selectedRoleId = useWatch({ control, name: 'roleId' });
  const selectedLanguage = useWatch({ control, name: 'language' });
  const selectedPreferredDepartmentId = useWatch({ control, name: 'preferredDepartmentId' });

  const departmentOptions = useMemo(() => {
    if (
      !selectedDepartment ||
      DEPARTMENT_POSITION_PRESETS.some((department) => department.value === selectedDepartment)
    ) {
      return DEPARTMENT_POSITION_PRESETS;
    }

    return [
      ...DEPARTMENT_POSITION_PRESETS,
      { value: selectedDepartment, label: selectedDepartment, positions: [] },
    ];
  }, [selectedDepartment]);

  const positionOptions = useMemo(() => {
    const presets = getPositionPresets(selectedDepartment);

    if (
      !selectedPosition ||
      presets.some((position) => position.value === selectedPosition)
    ) {
      return presets;
    }

    return [
      ...presets,
      { value: selectedPosition, label: selectedPosition, roleName: null },
    ];
  }, [selectedDepartment, selectedPosition]);

  const selectedPositionPreset = useMemo(
    () => getPositionPreset(selectedDepartment, selectedPosition),
    [selectedDepartment, selectedPosition],
  );

  const mappedRole = useMemo(
    () => getRoleByPresetName(roles, selectedPositionPreset?.roleName),
    [roles, selectedPositionPreset],
  );

  const currentRole = useMemo(
    () => roles.find((role) => role?._id === selectedRoleId) || null,
    [roles, selectedRoleId],
  );

  const isMappedRoleMissing = Boolean(
    selectedPositionPreset?.roleName && roles.length > 0 && !mappedRole,
  );
  const isPresetRoleApplied = Boolean(
    selectedPositionPreset?.roleName && mappedRole?._id && mappedRole._id === selectedRoleId,
  );
  const isManualRoleOverride = Boolean(
    selectedPositionPreset?.roleName &&
    mappedRole?._id &&
    selectedRoleId &&
    mappedRole._id !== selectedRoleId
  );

  const rolePresetNotice = useMemo(() => {
    if (!selectedPositionPreset?.roleName) return null;

    const presetRoleLabel = getUserRoleLabel(selectedPositionPreset.roleName, t);

    if (roles.length === 0) {
      return {
        tone: 'pending',
        title: t('users.rolePreset.pendingTitle', 'Rolle wird vorbereitet'),
        description: t('users.rolePreset.pendingDesc', '{role} wird angewendet, sobald Rollen geladen sind.', {
          role: presetRoleLabel,
        }),
      };
    }

    if (isMappedRoleMissing) {
      return {
        tone: 'warning',
        title: t('users.rolePreset.missingTitle', 'Standardrolle fehlt'),
        description: t('users.rolePreset.missingDesc', 'Die Rolle {role} ist nicht verfügbar. Wählen Sie im Zugang-Schritt eine Rolle manuell aus.', {
          role: presetRoleLabel,
        }),
      };
    }

    if (isManualRoleOverride) {
      return {
        tone: 'override',
        title: t('users.rolePreset.overrideTitle', 'Manuell angepasst'),
        description: t('users.rolePreset.overrideDesc', '{defaultRole} wäre die Standardrolle für diese Position. Aktuell ist {currentRole} ausgewählt.', {
          defaultRole: presetRoleLabel,
          currentRole: getUserRoleLabel(currentRole?.name, t) || t('users.roleOther', 'eine andere Rolle'),
        }),
      };
    }

    if (isPresetRoleApplied) {
      return {
        tone: 'applied',
        title: t('users.rolePreset.appliedTitle', 'Zugriff automatisch gesetzt'),
        description: t('users.rolePreset.appliedDesc', 'Die Berechtigungen werden über die Rolle {role} angewendet.', {
          role: getUserRoleLabel(mappedRole.name, t),
        }),
      };
    }

    return null;
  }, [
    currentRole,
    isManualRoleOverride,
    isMappedRoleMissing,
    isPresetRoleApplied,
    mappedRole,
    roles.length,
    selectedPositionPreset,
    t,
  ]);

  useEffect(() => {
    if (!pendingPresetRoleName) return;

    const role = getRoleByPresetName(roles, pendingPresetRoleName);
    if (!role?._id) return;

    setValue('roleId', role._id, { shouldDirty: true, shouldValidate: true });
  }, [pendingPresetRoleName, roles, setValue]);

  const applyPresetRole = (positionPreset) => {
    if (!positionPreset?.roleName) {
      setPendingPresetRoleName(null);
      return;
    }

    const role = getRoleByPresetName(roles, positionPreset.roleName);
    if (role?._id) {
      setValue('roleId', role._id, { shouldDirty: true, shouldValidate: true });
      setPendingPresetRoleName(null);
      return;
    }

    setPendingPresetRoleName(positionPreset.roleName);
  };

  const handleDepartmentChange = (department) => {
    const previousDepartment = getValues('department');
    const currentPosition = getValues('position');
    const currentRoleId = getValues('roleId');
    const previousPositionPreset = getPositionPreset(previousDepartment, currentPosition);
    const previousMappedRole = getRoleByPresetName(roles, previousPositionPreset?.roleName);

    setValue('department', department, { shouldDirty: true, shouldValidate: true });

    const nextPositions = getPositionPresets(department);
    const canKeepPosition = nextPositions.some((position) => position.value === currentPosition);

    if (!canKeepPosition) {
      setValue('position', '', { shouldDirty: true, shouldValidate: true });
      setPendingPresetRoleName(null);

      if (previousMappedRole?._id && currentRoleId === previousMappedRole._id) {
        setValue('roleId', defaultRoleId || '', { shouldDirty: true, shouldValidate: true });
      }

      return;
    }

    applyPresetRole(getPositionPreset(department, currentPosition));
  };

  const handlePositionChange = (position) => {
    const department = getValues('department');
    setValue('position', position, { shouldDirty: true, shouldValidate: true });
    applyPresetRole(getPositionPreset(department, position));
  };

  const handleRoleChange = (roleId) => {
    setPendingPresetRoleName(null);
    setValue('roleId', roleId, { shouldDirty: true, shouldValidate: true });
  };

  const handleDialogOpenChange = (nextOpen) => {
    setCurrentStep(0);
    setPendingPresetRoleName(null);
    onOpenChange(nextOpen);
  };

  const handleFormSubmit = (data) => {
    // Creating walks the wizard step by step; editing can be saved from any step.
    if (!isEdit && currentStep < STEPS.length - 1) {
      return;
    }
    const { skills, certifications, ...rest } = data;
    onSubmit({
      ...rest,
      salutation: data.salutation || null,
      preferredDepartmentId: data.preferredDepartmentId || null,
      schedulingSkills: splitCapabilities(skills),
      schedulingCertifications: splitCapabilities(certifications),
    });
    handleDialogOpenChange(false);
    reset();
  };

  // With free navigation an invalid field can sit on a step we are not looking
  // at — jump to the first step that has an error so it is actually visible.
  const handleInvalid = (formErrors) => {
    const failing = STEPS.findIndex((s) => s.fields.some((field) => formErrors?.[field]));
    if (failing >= 0 && failing !== currentStep) setCurrentStep(failing);
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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => e.preventDefault()}
      >
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
                    onClick={() => (isEdit || i < currentStep) && setCurrentStep(i)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg transition-all w-full',
                      isCurrent && 'bg-primary/10 text-primary',
                      isCompleted && 'text-emerald-600 cursor-pointer hover:bg-emerald-500/5',
                      !isCurrent && !isCompleted && (isEdit
                        ? 'text-muted-foreground cursor-pointer hover:bg-muted'
                        : 'text-muted-foreground/50'),
                    )}
                    disabled={!isEdit && i > currentStep}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all',
                      isCurrent && 'bg-primary text-primary-foreground shadow-sm shadow-primary/30',
                      isCompleted && 'bg-emerald-500 text-white',
                      !isCurrent && !isCompleted && (isEdit
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-muted text-muted-foreground/50'),
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:block truncate">{getStepLabel(s, t)}</span>
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
          onSubmit={handleSubmit(handleFormSubmit, handleInvalid)}
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
                <h3 className="text-sm font-semibold">{getStepLabel(step, t)}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('users.stepCounter', 'Schritt {current} von {total}', {
                    current: currentStep + 1,
                    total: STEPS.length,
                  })}
                </p>
              </div>
            </div>

            {/* Step 1: Personal */}
            {currentStep === 0 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.salutation', 'Anrede')}>
                  <Select
                    value={selectedSalutation || SALUTATION_NONE}
                    onValueChange={(v) => setValue('salutation', v === SALUTATION_NONE ? '' : v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.salutationPlaceholder', 'Anrede wählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SALUTATION_NONE}>{t('users.salutationNone', 'Keine Angabe')}</SelectItem>
                      <SelectItem value="herr">{t('users.salutationHerr', 'Herr')}</SelectItem>
                      <SelectItem value="frau">{t('users.salutationFrau', 'Frau')}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label={t('users.firstName')} error={errors.firstName?.message} required>
                    <Input placeholder="Max" {...register('firstName')} autoFocus />
                  </FormField>
                  <FormField label={t('users.lastName')} error={errors.lastName?.message} required>
                    <Input placeholder="Muster" {...register('lastName')} />
                  </FormField>
                </div>
              </div>
            )}

            {/* Step 2: Contact */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.email')} error={errors.email?.message} required>
                  <Input type="email" placeholder="max.muster@mbboiler.ch" {...register('email')} autoFocus />
                </FormField>
                <FormField
                  label={`${t('users.phone')} (${t('common.optional', 'optional')})`}
                  error={errors.phone?.message}
                >
                  <Input placeholder="+41 79 123 45 67" {...register('phone')} />
                </FormField>
              </div>
            )}

            {/* Step 3: Work */}
            {currentStep === 2 && (
              <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-right-4 duration-300 sm:grid-cols-2">
                <FormField label={t('users.department') || 'Abteilung'}>
                  <Select value={selectedDepartment || ''} onValueChange={handleDepartmentChange}>
                    <SelectTrigger autoFocus>
                      <SelectValue placeholder={t('users.departmentPlaceholder') || 'z.B. Technik'} />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department.value} value={department.value}>
                          {getPresetDisplayLabel(department, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t('users.position') || 'Position'}>
                  <Select
                    value={selectedPosition || ''}
                    onValueChange={handlePositionChange}
                    disabled={!selectedDepartment || positionOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.positionPlaceholder') || 'z.B. Projektleiter'} />
                    </SelectTrigger>
                    <SelectContent>
                      {positionOptions.map((position) => (
                        <SelectItem key={position.value} value={position.value}>
                          {getPresetDisplayLabel(position, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                {rolePresetNotice && (
                  <RolePresetNotice notice={rolePresetNotice} className="sm:col-span-2" />
                )}
                <FormField
                  label={t('users.preferredTeam') || 'Bevorzugtes Team'}
                  className="sm:col-span-2"
                >
                  <Select
                    value={selectedPreferredDepartmentId || EMPTY_TEAM_VALUE}
                    onValueChange={(value) => {
                      setValue('preferredDepartmentId', value === EMPTY_TEAM_VALUE ? null : value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    disabled={assignmentTargets.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.preferredTeamPlaceholder') || 'Team für Projektzuweisungen wählen'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_TEAM_VALUE}>
                        {t('users.noPreferredTeam') || 'Kein Team'}
                      </SelectItem>
                      {assignmentTargets.map((target) => (
                        <SelectItem key={target._id || target.id} value={target._id || target.id}>
                          {[target.name, target.code ? `(${target.code})` : null].filter(Boolean).join(' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {assignmentTargets.length === 0
                      ? (t('users.preferredTeamUnavailable') || 'Keine aktiven Teams verfügbar.')
                      : (t('users.preferredTeamHint') || 'Dieses Team wird verwendet, wenn der Benutzer einem Projekt als Team zugewiesen wird.')}
                  </p>
                </FormField>

                <FormField label={t('users.skills', 'Skills / Qualifikationen')} className="sm:col-span-2">
                  <Input placeholder={t('users.skillsPlaceholder', 'z.B. Wärmepumpe, Gasheizung, Solar')} {...register('skills')} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('users.skillsHint', 'Mit Komma trennen — Grundlage für die Einsatzplanung.')}
                  </p>
                </FormField>

                <FormField label={t('users.certifications', 'Zertifikate / Kompetenzen')} className="sm:col-span-2">
                  <Input placeholder={t('users.certificationsPlaceholder', 'z.B. Kältemittel-Zertifikat, Schweissausweis')} {...register('certifications')} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('users.certificationsHint', 'Mit Komma trennen.')}
                  </p>
                </FormField>
              </div>
            )}

            {/* Step 4: Address */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.street') || 'Strasse'}>
                  <Input placeholder="Musterstrasse 1" {...register('street')} autoFocus />
                </FormField>
                <FormField
                  label={`${t('users.addressSupplement', 'Adresszusatz')} (${t('common.optional', 'optional')})`}
                  error={errors.addressSupplement?.message}
                >
                  <Input placeholder="z.B. Postfach 123, c/o Verwaltung Müller AG" {...register('addressSupplement')} />
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
                  <Select value={selectedRoleId || ''} onValueChange={handleRoleChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.selectRole')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role._id} value={role._id}>{getUserRoleLabel(role.name, t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t('users.language')}>
                  <Select value={selectedLanguage || 'de'} onValueChange={(val) => setValue('language', val)}>
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
                {rolePresetNotice && (
                  <RolePresetNotice notice={rolePresetNotice} className="col-span-2" />
                )}
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
                  {t('common.back', 'Zurück')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="rounded-lg h-9" onClick={() => handleDialogOpenChange(false)}>
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

              {!isLastStep && (
                <Button
                  type="button"
                  variant={isEdit ? 'outline' : 'default'}
                  className="rounded-lg h-9 px-5 gap-1.5"
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
              {(isLastStep || isEdit) && (
                <Button type="submit" className="rounded-lg h-9 px-5 gap-1.5 shadow-sm" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? t('users.save') : t('users.create')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolePresetNotice({ notice, className }) {
  const isWarning = notice.tone === 'warning' || notice.tone === 'override';
  const Icon = isWarning ? AlertTriangle : ShieldCheck;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs',
        isWarning
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
        notice.tone === 'pending' && 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{notice.title}</p>
        <p className="mt-0.5 leading-relaxed opacity-80">{notice.description}</p>
      </div>
    </div>
  );
}
