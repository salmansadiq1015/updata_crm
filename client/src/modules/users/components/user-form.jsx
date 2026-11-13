'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { buildUserFormSchema } from '@/modules/users/validations/user';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import styles from './user-form.module.css';
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
  ChevronLeft, Check, ArrowRight, AlertTriangle, ShieldCheck, KeyRound, Eye, EyeOff,
} from 'lucide-react';

const EMPTY_TEAM_VALUE = '__none';
const SALUTATION_NONE = '__none_salutation';

// Comma-separated skills/certifications text -> trimmed, de-duplicated array.
function splitCapabilities(value) {
  if (!value) return [];
  return [...new Set(String(value).split(',').map((v) => v.trim()).filter(Boolean))];
}

const STEPS = [
  { id: 'personal', labelKey: 'users.step.personal', fallback: 'Personal', icon: User, fields: ['firstName', 'lastName', 'birthDate', 'initials'] },
  { id: 'contact', labelKey: 'users.step.contact', fallback: 'Contact', icon: Mail, fields: ['email', 'phone'] },
  { id: 'work', labelKey: 'users.step.work', fallback: 'Work', icon: Briefcase, fields: ['department', 'position', 'preferredDepartmentId'] },
  { id: 'address', labelKey: 'users.step.address', fallback: 'Address', icon: MapPin, fields: ['street', 'addressSupplement', 'zip', 'city', 'country'] },
  { id: 'access', labelKey: 'users.step.access', fallback: 'Access', icon: Shield, fields: ['roleId', 'language', 'password', 'confirmPassword'] },
];

function getStepLabel(step, t) {
  return t(step.labelKey, step.fallback);
}

export function UserForm({ open, onOpenChange, onSubmit, defaultValues, roles = [], assignmentTargets = [], isLoading, canManageRole = true }) {
  const { t, locale } = useLanguage();
  const defaultLanguage = ['de', 'en', 'fr', 'it'].includes(locale) ? locale : 'en';
  const defaultCountry = t('users.countryExample', 'Switzerland');
  const isEdit = !!defaultValues?._id;
  const defaultRoleId = roles.find((r) => r.name === 'User')?._id || '';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const schema = useMemo(() => buildUserFormSchema(t, { isEdit }), [t, isEdit]);
  const [currentStep, setCurrentStep] = useState(0);
  const [pendingPresetRoleName, setPendingPresetRoleName] = useState(null);

  const { register, handleSubmit, reset, setValue, getValues, control, formState: { errors, isSubmitting }, trigger } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '', lastName: '', salutation: '', birthDate: '', initials: '',
      email: '', phone: '', password: '', confirmPassword: '',
      department: '', position: '', skills: '', certifications: '',
      street: '', addressSupplement: '', city: '', zip: '', country: defaultCountry,
      roleId: defaultRoleId, language: defaultLanguage, preferredDepartmentId: null,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        salutation: defaultValues.salutation || '',
        birthDate: defaultValues.birthDate ? String(defaultValues.birthDate).slice(0, 10) : '',
        initials: defaultValues.initials || '',
        email: defaultValues.email || '',
        password: '', confirmPassword: '',
        phone: defaultValues.phone || '',
        department: defaultValues.department || '',
        position: defaultValues.position || '',
        street: defaultValues.street || '',
        addressSupplement: defaultValues.addressSupplement || '',
        city: defaultValues.city || '',
        zip: defaultValues.zip || '',
        country: defaultValues.country || '',
        skills: (defaultValues.schedulingSkills || []).join(', '),
        certifications: (defaultValues.schedulingCertifications || []).join(', '),
        roleId: defaultValues.role?._id || defaultValues.roleId || '',
        preferredDepartmentId: getPreferredDepartmentId(defaultValues),
        language: defaultValues.language || defaultLanguage,
      });
    } else {
      reset({
        firstName: '', lastName: '', salutation: '', birthDate: '', initials: '',
        email: '', phone: '', password: '', confirmPassword: '',
        department: '', position: '', skills: '', certifications: '',
        street: '', addressSupplement: '', city: '', zip: '', country: defaultCountry,
        roleId: defaultRoleId, language: defaultLanguage, preferredDepartmentId: null,
      });
    }
  }, [defaultValues, reset, defaultRoleId, open, defaultLanguage, defaultCountry]);

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
        title: t('users.rolePreset.pendingTitle', "Role pending"),
        description: t('users.rolePreset.pendingDesc', "{role} will be applied once roles are loaded.", {
          role: presetRoleLabel,
        }),
      };
    }

    if (isMappedRoleMissing) {
      return {
        tone: 'warning',
        title: t('users.rolePreset.missingTitle', "Default role missing"),
        description: t('users.rolePreset.missingDesc', "The role {role} is not available. Select a role manually in the Access step.", {
          role: presetRoleLabel,
        }),
      };
    }

    if (isManualRoleOverride) {
      return {
        tone: 'override',
        title: t('users.rolePreset.overrideTitle', "Manually adjusted"),
        description: t('users.rolePreset.overrideDesc', "{defaultRole} is the default role for this position. {currentRole} is currently selected.", {
          defaultRole: presetRoleLabel,
          currentRole: getUserRoleLabel(currentRole?.name, t) || t('users.roleOther', "another role"),
        }),
      };
    }

    if (isPresetRoleApplied) {
      return {
        tone: 'applied',
        title: t('users.rolePreset.appliedTitle', "Access set automatically"),
        description: t('users.rolePreset.appliedDesc', "Permissions are applied through the {role} role.", {
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
    if (isLoading || isSubmitting) return;
    setShowPassword(false);
    setShowConfirmation(false);
    setCurrentStep(0);
    setPendingPresetRoleName(null);
    onOpenChange(nextOpen);
  };

  const handleFormSubmit = async (data) => {
    // Creating walks the wizard step by step; editing can be saved from any step.
    if (!isEdit && currentStep < STEPS.length - 1) {
      return;
    }
    const { skills, certifications, confirmPassword: _confirmPassword, ...rest } = data;
    if (isEdit && !canManageRole) delete rest.roleId;
    if (isEdit && (!canManageRole || !rest.password)) delete rest.password;
    try {
      await onSubmit({
        ...rest,
        birthDate: data.birthDate || null,
        salutation: data.salutation || null,
        preferredDepartmentId: data.preferredDepartmentId || null,
        schedulingSkills: splitCapabilities(skills),
        schedulingCertifications: splitCapabilities(certifications),
      });
      onOpenChange(false);
      setShowPassword(false);
      setShowConfirmation(false);
      setCurrentStep(0);
      reset();
    } catch {
      // The mutation shows the API error; preserve the form so it can be corrected.
    }
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
      <DialogContent className={cn(styles.dialog, 'p-0 gap-0 overflow-hidden flex flex-col')}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className={cn(styles.header, 'shrink-0')}>
          <div className={styles.eyebrow}><ShieldCheck className="size-3.5" />{t('users.formEyebrow', 'People & access')}</div>
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {isEdit ? t('users.editUser') : t('users.newUser')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit
              ? (t('users.editDesc', "Edit user information."))
              : t('users.createWithPasswordDesc', 'Create a profile, set access and choose a secure password.')
            }
          </DialogDescription>
        </DialogHeader>

        <nav data-slot="user-form-steps" className={styles.stepper} aria-label={t('users.formSteps', 'User setup steps')}>
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" aria-current={i === currentStep ? 'step' : undefined}
              disabled={(!isEdit && i > currentStep) || isSubmitting || isLoading}
              onClick={() => setCurrentStep(i)}
              className={cn(styles.step, i < currentStep && styles.completed)}>
              <span className={styles.stepNumber}>{i < currentStep ? <Check className="size-3.5" /> : i + 1}</span>
              <span className="truncate">{getStepLabel(s, t)}</span>
            </button>
          ))}
        </nav>

        {/* Form content */}
        <form
          data-slot="user-form"
          onSubmit={handleSubmit(handleFormSubmit, handleInvalid)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && currentStep < STEPS.length - 1 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          <div className={cn(styles.body, 'flex-1 min-h-0')}>
            {/* Step header */}
            <div className={styles.sectionHeading}>
              <div className={styles.sectionIcon}>
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight">{getStepLabel(step, t)}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('users.stepCounter', "Step {current} of {total}", {
                    current: currentStep + 1,
                    total: STEPS.length,
                  })}
                </p>
              </div>
            </div>

            {/* Step 1: Personal */}
            {currentStep === 0 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.salutation', "Salutation")}>
                  <Select
                    value={selectedSalutation || SALUTATION_NONE}
                    onValueChange={(v) => setValue('salutation', v === SALUTATION_NONE ? '' : v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.salutationPlaceholder', "Select salutation")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SALUTATION_NONE}>{t('users.salutationNone', "None")}</SelectItem>
                      <SelectItem value="herr">{t('users.salutationHerr', "Mr")}</SelectItem>
                      <SelectItem value="frau">{t('users.salutationFrau', "Ms")}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label={t('users.firstName')} error={errors.firstName?.message} required>
                    <Input placeholder="Max" {...register('firstName')} autoFocus />
                  </FormField>
                  <FormField label={t('users.lastName')} error={errors.lastName?.message} required>
                    <Input placeholder="Muster" {...register('lastName')} />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label={t('users.birthDate', "Date of birth")} error={errors.birthDate?.message}>
                    <Input type="date" {...register('birthDate')} />
                  </FormField>
                  <FormField
                    label={t('users.initials', "Initials")}
                    error={errors.initials?.message}
                    description={t('users.initialsHint', "e.g. Timo Schweizer = TS")}
                  >
                    <Input placeholder="TS" maxLength={5} className="uppercase" {...register('initials')} />
                  </FormField>
                </div>
              </div>
            )}

            {/* Step 2: Contact */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.email')} error={errors.email?.message} required>
                  <Input type="email" placeholder="max.muster@updata.ai" {...register('email')} autoFocus />
                </FormField>
                <FormField
                  label={`${t('users.phone')} (${t('common.optional', "optional")})`}
                  error={errors.phone?.message}
                >
                  <Input placeholder="+41 79 123 45 67" {...register('phone')} />
                </FormField>
              </div>
            )}

            {/* Step 3: Work */}
            {currentStep === 2 && (
              <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-right-4 duration-300 sm:grid-cols-2">
                <FormField label={t('users.department', "Department")}>
                  <Select value={selectedDepartment || ''} onValueChange={handleDepartmentChange}>
                    <SelectTrigger autoFocus>
                      <SelectValue placeholder={t('users.departmentPlaceholder', "e.g. Engineering")} />
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
                <FormField label={t('users.position', "Position")}>
                  <Select
                    value={selectedPosition || ''}
                    onValueChange={handlePositionChange}
                    disabled={!selectedDepartment || positionOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('users.positionPlaceholder', "e.g. Project Manager")} />
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
                  label={t('users.preferredTeam', "Preferred team")}
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
                      <SelectValue placeholder={t('users.preferredTeamPlaceholder', "Select team for project assignments")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_TEAM_VALUE}>
                        {t('users.noPreferredTeam', "No team")}
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
                      ? (t('users.preferredTeamUnavailable', "No active teams available."))
                      : (t('users.preferredTeamHint', "This team is used when the user is assigned to a project as team work."))}
                  </p>
                </FormField>

                <FormField label={t('users.skills', "Skills / Qualifications")} className="sm:col-span-2">
                  <Input placeholder={t('users.skillsPlaceholder', "e.g. heat pump, gas heating, solar")} {...register('skills')} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('users.skillsHint', "Separate with commas — basis for deployment planning.")}
                  </p>
                </FormField>

                <FormField label={t('users.certifications', "Certificates / Competences")} className="sm:col-span-2">
                  <Input placeholder={t('users.certificationsPlaceholder', "e.g. refrigerant cert., welding license")} {...register('certifications')} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('users.certificationsHint', "Separate with commas.")}
                  </p>
                </FormField>
              </div>
            )}

            {/* Step 4: Address */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.street', "Street")}>
                  <Input placeholder={t('users.streetExample', 'Example Street 1')} {...register('street')} autoFocus />
                </FormField>
                <FormField
                  label={`${t('users.addressSupplement', "Address supplement")} (${t('common.optional', "optional")})`}
                  error={errors.addressSupplement?.message}
                >
                  <Input placeholder={t('users.addressSupplementExample', 'PO Box 123, c/o Example Ltd')} {...register('addressSupplement')} />
                </FormField>
                <div className="grid grid-cols-3 gap-4">
                  <FormField label={t('users.zip', "ZIP")}>
                    <Input placeholder="3000" {...register('zip')} />
                  </FormField>
                  <FormField label={t('users.city', "City")} className="col-span-2">
                    <Input placeholder="Bern" {...register('city')} />
                  </FormField>
                </div>
                <FormField label={t('users.country', "Country")}>
                  <Input placeholder={t('users.countryExample', 'Switzerland')} {...register('country')} />
                </FormField>
              </div>
            )}

            {/* Step 5: Access */}
            {currentStep === 4 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <FormField label={t('users.role')} error={errors.roleId?.message} required>
                  <Select value={selectedRoleId || ''} onValueChange={handleRoleChange} disabled={isEdit && !canManageRole}>
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
                      <SelectItem value="de">{t('users.languageNames.de', 'German')}</SelectItem>
                      <SelectItem value="en">{t('users.languageNames.en', 'English')}</SelectItem>
                      <SelectItem value="fr">{t('users.languageNames.fr', 'French')}</SelectItem>
                      <SelectItem value="it">{t('users.languageNames.it', 'Italian')}</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                {rolePresetNotice && (
                  <RolePresetNotice notice={rolePresetNotice} className="sm:col-span-2" />
                )}
                {(!isEdit || canManageRole) && <section className={styles.passwordPanel} aria-label={t('users.credentials', 'Sign-in credentials')}>
                  <div className="flex items-start gap-3">
                    <KeyRound className="size-4 mt-0.5 text-primary" />
                    <div>
                      <h4 className="text-sm font-semibold">{t('users.credentials', 'Sign-in credentials')}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{isEdit ? t('users.passwordUpdateHint', 'Leave both fields blank to keep the current password. Setting a new password signs the user out of all sessions and replaces outstanding setup or reset links.') : t('users.passwordSetupHint', 'The user can sign in immediately with their email and this password.')}</p>
                    </div>
                  </div>
                  <div className={styles.passwordGrid}>
                    <FormField label={t('users.password', 'Password')} required={!isEdit} error={errors.password?.message}>
                      <div className={styles.passwordInput}>
                        <Input aria-label={t('users.password', 'Password')} type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={128} {...register('password')} />
                        <Button type="button" variant="ghost" size="icon" className={cn(styles.passwordToggle, 'size-8')} aria-pressed={showPassword}
                          aria-label={t(showPassword ? 'users.hidePassword' : 'users.showPassword', showPassword ? 'Hide password' : 'Show password')} onClick={() => setShowPassword((value) => !value)}>
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </FormField>
                    <FormField label={t('users.confirmPassword', 'Confirm password')} required={!isEdit} error={errors.confirmPassword?.message}>
                      <div className={styles.passwordInput}>
                        <Input aria-label={t('users.confirmPassword', 'Confirm password')} type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" maxLength={128} {...register('confirmPassword')} />
                        <Button type="button" variant="ghost" size="icon" className={cn(styles.passwordToggle, 'size-8')} aria-pressed={showConfirmation}
                          aria-label={t(showConfirmation ? 'users.hideConfirmation' : 'users.showConfirmation', showConfirmation ? 'Hide confirmation' : 'Show confirmation')} onClick={() => setShowConfirmation((value) => !value)}>
                          {showConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </FormField>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('users.passwordRequirements', 'Use 10–128 characters with uppercase and lowercase letters, a number and a symbol.')}</p>
                </section>}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={cn(styles.footer, 'shrink-0')}>
            <div>
              {currentStep > 0 ? (
                <Button type="button" variant="ghost" className="gap-1.5 rounded-lg h-9" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('common.back', "Back")}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="rounded-lg h-9" onClick={() => handleDialogOpenChange(false)}>
                  {t('users.cancel')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Progress dots */}
              <div className="hidden sm:flex items-center gap-1 mr-2" aria-hidden="true">
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
                  {t('common.next', "Next")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
              {(isLastStep || isEdit) && (
                <Button type="submit" className="rounded-lg h-9 px-5 gap-1.5 shadow-sm" disabled={isLoading || isSubmitting}>
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
