'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createRoleSchema } from '@/modules/roles/validations/role';
import { useQuery } from '@tanstack/react-query';
import { roleService } from '@/modules/roles/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Loader2, Shield, Key, Check, Search,
  ChevronLeft, ArrowRight, Eye, Pencil, Trash2, Crown,
  CheckCircle2, Circle,
} from 'lucide-react';

const STEPS = [
  { id: 'info', label: 'Rolleninfo', icon: Shield, fields: ['name'] },
  { id: 'permissions', label: 'Berechtigungen', icon: Key, fields: [] },
];

const ACTION_META = {
  read:   { icon: Eye,     color: 'text-sky-500',     bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20',     selectedBg: 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300' },
  write:  { icon: Pencil,  color: 'text-emerald-500', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', selectedBg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
  delete: { icon: Trash2,  color: 'text-rose-500',    bg: 'bg-rose-500/10',    ring: 'ring-rose-500/20',    selectedBg: 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300' },
  admin:  { icon: Crown,   color: 'text-amber-500',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20',   selectedBg: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300' },
};

const MODULE_ACCENTS = [
  { bg: 'bg-brand-500/10', text: 'text-brand-500', ring: 'ring-brand-500/20' },
  { bg: 'bg-sky-500/10',    text: 'text-sky-500',    ring: 'ring-sky-500/20' },
  { bg: 'bg-emerald-500/10',text: 'text-emerald-500',ring: 'ring-emerald-500/20' },
  { bg: 'bg-amber-500/10',  text: 'text-amber-500',  ring: 'ring-amber-500/20' },
  { bg: 'bg-rose-500/10',   text: 'text-rose-500',   ring: 'ring-rose-500/20' },
  { bg: 'bg-indigo-500/10', text: 'text-indigo-500', ring: 'ring-indigo-500/20' },
  { bg: 'bg-pink-500/10',   text: 'text-pink-500',   ring: 'ring-pink-500/20' },
  { bg: 'bg-teal-500/10',   text: 'text-teal-500',   ring: 'ring-teal-500/20' },
];

export function RoleForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage(); // global t supports t(key, fallback)
  const isEdit = !!defaultValues?._id;
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [permSearch, setPermSearch] = useState('');

  const STEP_LABELS = [
    { id: 'info', label: t('roles.stepInfo', 'Rolleninfo'), icon: Shield },
    { id: 'permissions', label: t('roles.stepPermissions', 'Berechtigungen'), icon: Key },
  ];

  const { data: permissions } = useQuery({
    queryKey: queryKeys.roles.permissions(),
    queryFn: () => roleService.getPermissions(),
    enabled: open,
  });

  const { register, handleSubmit, reset, setValue, trigger, formState: { errors } } = useForm({
    resolver: zodResolver(createRoleSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setCurrentStep(0);
    if (defaultValues) {
      const perms = defaultValues.permissions?.map((p) => p._id || p) || [];
      reset({
        name: defaultValues.name || '',
        description: defaultValues.description || '',
        permissions: perms,
      });
      setSelectedPerms(perms);
    } else {
      reset({ name: '', description: '', permissions: [] });
      setSelectedPerms([]);
    }
    setPermSearch('');
  }, [defaultValues, reset, open]);

  // API returns grouped format: [{ module, actions: [{ _id, action, description }] }]
  const rawPerms = permissions || [];
  const isGroupedFormat = rawPerms.length > 0 && rawPerms[0]?.actions;

  const allPerms = useMemo(() => (
    isGroupedFormat
      ? rawPerms.flatMap((g) => g.actions.map((a) => ({ ...a, module: g.module })))
      : rawPerms
  ), [rawPerms, isGroupedFormat]);

  const grouped = useMemo(() => (
    isGroupedFormat
      ? rawPerms.reduce((acc, g) => {
          acc[g.module] = g.actions.map((a) => ({ ...a, module: g.module }));
          return acc;
        }, {})
      : allPerms.reduce((acc, perm) => {
          const moduleName = perm.module || 'other';
          if (!acc[moduleName]) acc[moduleName] = [];
          acc[moduleName].push(perm);
          return acc;
        }, {})
  ), [rawPerms, allPerms, isGroupedFormat]);

  const filteredGrouped = Object.entries(grouped).filter(([module]) =>
    !permSearch || module.toLowerCase().includes(permSearch.toLowerCase())
  );

  const togglePermission = (permId) => {
    setSelectedPerms((prev) => {
      const next = prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId];
      setValue('permissions', next, { shouldValidate: true });
      return next;
    });
  };

  const toggleModule = (modulePerms) => {
    const moduleIds = modulePerms.map((p) => p._id);
    const allSelected = moduleIds.every((id) => selectedPerms.includes(id));
    setSelectedPerms((prev) => {
      const next = allSelected
        ? prev.filter((id) => !moduleIds.includes(id))
        : [...new Set([...prev, ...moduleIds])];
      setValue('permissions', next, { shouldValidate: true });
      return next;
    });
  };

  const selectAll = () => {
    const allIds = allPerms.map((p) => p._id);
    setSelectedPerms(allIds);
    setValue('permissions', allIds, { shouldValidate: true });
  };

  const deselectAll = () => {
    setSelectedPerms([]);
    setValue('permissions', [], { shouldValidate: true });
  };

  const goNext = async () => {
    const stepFields = STEPS[currentStep].fields;
    if (stepFields.length) {
      const valid = await trigger(stepFields);
      if (!valid) return;
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const handleFormSubmit = (data) => {
    // Guard: only ever actually submit when on the final step.
    // Stepper navigation is handled by the Next button's own onClick.
    if (currentStep < STEPS.length - 1) {
      return;
    }
    data.permissions = selectedPerms;
    onSubmit(data);
    onOpenChange(false);
  };

  const isLastStep = currentStep === STEPS.length - 1;
  const step = STEPS[currentStep];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-lg font-bold">
            {isEdit ? (t('roles.editRole', 'Rolle bearbeiten')) : (t('roles.newRole', 'Neue Rolle'))}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? (t('roles.editDesc', 'Passen Sie Name, Beschreibung und Berechtigungen dieser Rolle an.'))
              : (t('roles.createDesc', 'Erstellen Sie eine neue Rolle mit spezifischen Berechtigungen.'))}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="px-6 pb-4 shrink-0">
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((s, i) => {
              const StepIcon = s.icon;
              const isCompleted = i < currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => i < currentStep && setCurrentStep(i)}
                    disabled={i > currentStep}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all w-full',
                      isCurrent && 'bg-primary/10 text-primary',
                      isCompleted && 'text-emerald-600 hover:bg-emerald-500/5 cursor-pointer',
                      !isCurrent && !isCompleted && 'text-muted-foreground/50 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all',
                      isCurrent && 'bg-primary text-primary-foreground shadow-sm shadow-primary/30',
                      isCompleted && 'bg-emerald-500 text-white',
                      !isCurrent && !isCompleted && 'bg-muted text-muted-foreground/50'
                    )}>
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </div>
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <StepIcon className="h-3.5 w-3.5" />
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      'h-px w-6 shrink-0 mx-1',
                      i < currentStep ? 'bg-emerald-500' : 'bg-border'
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Separator className="shrink-0" />

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          onKeyDown={(e) => {
            // Prevent Enter key from submitting the form unless on the last step
            if (e.key === 'Enter' && currentStep < STEPS.length - 1 && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="flex flex-col flex-1 min-h-0"
        >
          {/* ── Step 1: Role Info ── */}
          {currentStep === 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{t('roles.infoTitle', 'Rolleninformationen')}</h3>
                  <p className="text-xs text-muted-foreground">{t('roles.infoDesc', 'Grundlegende Angaben zur Rolle')}</p>
                </div>
              </div>

              <div className="w-full space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">
                    {t('roles.name', 'Name')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder={t('roles.namePlaceholder', 'z.B. Projektleiter')}
                    autoFocus
                    {...register('name')}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-xs font-medium">
                    {t('roles.description', 'Beschreibung')} ({t('roles.optional', 'optional')})
                  </Label>
                  <Textarea
                    id="description"
                    rows={3}
                    placeholder={t('roles.descriptionPlaceholder', 'Kurze Beschreibung der Rolle und ihrer Verantwortlichkeiten...')}
                    className="resize-none"
                    {...register('description')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('roles.descriptionHint', 'Hilft Teammitgliedern, den Zweck dieser Rolle zu verstehen.')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Permissions ── */}
          {currentStep === 1 && (
            <div className="flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Permissions header */}
              <div className="px-6 pt-6 pb-3 shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-brand-500/10 flex items-center justify-center ring-1 ring-brand-500/20">
                      <Key className="h-4 w-4 text-brand-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{t('roles.permsTitle', 'Berechtigungen')}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t('roles.permsDesc', 'Wählen Sie die Zugriffsrechte für diese Rolle')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      {selectedPerms.length} / {allPerms.length} {t('roles.selected', 'ausgewählt')}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
                      {t('roles.selectAll', 'Alle')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={deselectAll}>
                      {t('roles.selectNone', 'Keine')}
                    </Button>
                  </div>
                </div>

                {errors.permissions && (
                  <p className="text-xs text-destructive mb-2">{errors.permissions.message}</p>
                )}

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t('roles.searchModule', 'Modul suchen...')}
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Permissions scroll area */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 scrollbar-thin">
                {filteredGrouped.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Search className="h-10 w-10 opacity-30 mb-3" />
                    <p className="text-sm">{t('roles.noModulesFound', 'Keine Module gefunden')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredGrouped.map(([module, perms], idx) => {
                      const moduleSelected = perms.filter((p) => selectedPerms.includes(p._id)).length;
                      const allModuleSelected = moduleSelected === perms.length;
                      const someSelected = moduleSelected > 0 && !allModuleSelected;
                      const accent = MODULE_ACCENTS[idx % MODULE_ACCENTS.length];
                      return (
                        <div
                          key={module}
                          className={cn(
                            'rounded-xl border overflow-hidden transition-colors',
                            allModuleSelected
                              ? 'border-primary/30 bg-primary/[0.02]'
                              : 'border-border'
                          )}
                        >
                          {/* Module header */}
                          <button
                            type="button"
                            onClick={() => toggleModule(perms)}
                            className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'h-8 w-8 rounded-lg flex items-center justify-center ring-1',
                                accent.bg, accent.ring
                              )}>
                                <span className={cn('text-xs font-bold uppercase', accent.text)}>
                                  {module.charAt(0)}
                                </span>
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold capitalize">{module}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {moduleSelected} {t('roles.of', 'von')} {perms.length} {t('roles.active', 'aktiv')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: perms.length }).map((_, i) => (
                                  <span
                                    key={i}
                                    className={cn(
                                      'h-1 w-4 rounded-full',
                                      i < moduleSelected
                                        ? 'bg-primary'
                                        : 'bg-muted-foreground/20'
                                    )}
                                  />
                                ))}
                              </div>
                              <div className={cn(
                                'h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0',
                                allModuleSelected && 'bg-primary border-primary',
                                someSelected && 'bg-primary/50 border-primary/50',
                                !moduleSelected && 'border-border'
                              )}>
                                {allModuleSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                {someSelected && <div className="h-0.5 w-2 bg-primary-foreground rounded-full" />}
                              </div>
                            </div>
                          </button>

                          {/* Permission actions grid — 4 columns on wide modal */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3 pt-0">
                            {perms.map((perm) => {
                              const isSelected = selectedPerms.includes(perm._id);
                              const meta = ACTION_META[perm.action] || {
                                icon: Circle,
                                color: 'text-muted-foreground',
                                bg: 'bg-muted',
                                ring: 'ring-border',
                                selectedBg: 'bg-muted border-border text-foreground',
                              };
                              const ActionIcon = meta.icon;
                              return (
                                <button
                                  type="button"
                                  key={perm._id}
                                  onClick={() => togglePermission(perm._id)}
                                  className={cn(
                                    'group/perm flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs transition-all border text-left',
                                    isSelected
                                      ? meta.selectedBg
                                      : 'border-border bg-card hover:bg-muted/50 hover:border-border'
                                  )}
                                >
                                  <div className={cn(
                                    'h-7 w-7 rounded-md flex items-center justify-center shrink-0',
                                    isSelected ? 'bg-white/40 dark:bg-white/10' : meta.bg
                                  )}>
                                    <ActionIcon className={cn('h-3.5 w-3.5', isSelected ? '' : meta.color)} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold capitalize leading-none">{perm.action}</p>
                                    {perm.description && (
                                      <p className={cn(
                                        'text-[10px] mt-1 line-clamp-1',
                                        isSelected ? 'opacity-70' : 'text-muted-foreground'
                                      )}>
                                        {perm.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className={cn(
                                    'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                    isSelected ? 'bg-current border-current' : 'border-muted-foreground/30'
                                  )}>
                                    {isSelected && <Check className="h-2.5 w-2.5 text-white dark:text-black" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <Separator className="shrink-0" />

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 shrink-0 bg-muted/20">
            <div>
              {currentStep > 0 ? (
                <Button type="button" variant="ghost" className="gap-1.5 h-9" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                  {t('common.back', 'Zurück')}
                </Button>
              ) : (
                <Button type="button" variant="ghost" className="h-9" onClick={() => onOpenChange(false)}>
                  {t('common.cancel', 'Abbrechen')}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Progress dots */}
              <div className="flex items-center gap-1 mr-1">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      i === currentStep ? 'w-5 bg-primary' :
                      i < currentStep ? 'w-1.5 bg-emerald-500' :
                      'w-1.5 bg-border'
                    )}
                  />
                ))}
              </div>

              {isLastStep ? (
                <Button type="submit" className="h-9 gap-1.5 shadow-theme-sm" disabled={isLoading}>
                  {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isEdit ? (t('common.save', 'Speichern')) : (t('common.create', 'Erstellen'))}
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
