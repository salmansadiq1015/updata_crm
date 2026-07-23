'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { getCreateAssignmentSchema } from '../../validations/assignment';
import { useAssignmentMutations } from '../../hooks/use-assignment-mutations';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
import { AssignmentRecurrenceForm } from './assignment-recurrence-form';
import { AssignmentWorkContextFields } from './assignment-work-context-fields';
import { AppointmentTimeWindowField } from './appointment-time-window-field';
import { ConflictDialog } from '../conflict/conflict-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FormField, FormSection, FormBody } from '@/components/ui/form-field';
import {
  AlertTriangle, BadgeCheck, BriefcaseBusiness, CalendarClock, Check,
  ChevronsUpDown, Loader2, Repeat, Search, ShieldAlert, UsersRound, X,
} from 'lucide-react';
import { ASSIGNMENT_TYPE_META, PRIORITY_META, translateMetaLabel } from '../../constants/deploy-constants';

const BLANK = {
  employeeIds: [],
  orderId: '',
  projectId: '',
  assignmentType: 'SERVICE_CALL',
  title: '',
  startDatetime: '',
  endDatetime: '',
  isFullDay: false,
  priority: 'NORMAL',
  instructions: '',
  requiredSkills: '',
  recommendedSkills: '',
  requiredCertifications: '',
  recommendedCertifications: '',
  customerId: '',
  siteId: '',
  colorCode: '',
  isCustomerAppointment: false,
  recurrence: null,
  appointment: null,
};

const DEFAULT_RECURRENCE = {
  frequency: 'WEEKLY',
  interval: 1,
  endType: 'NEVER',
};

const EMPLOYEE_PICKER_LIMIT = 80;
const EMPLOYEE_FILTERS = [
  { value: 'ALL', labelKey: 'deploy.form.employeeFilterAll', fallback: 'Alle' },
  { value: 'AVAILABLE', labelKey: 'deploy.form.employeeFilterAvailable', fallback: 'Verfügbar' },
  { value: 'WARNING', labelKey: 'deploy.form.employeeFilterWarnings', fallback: 'Warnungen' },
  { value: 'UNAVAILABLE', labelKey: 'deploy.form.employeeFilterUnavailable', fallback: 'Abwesend' },
  { value: 'QUALIFIED', labelKey: 'deploy.form.employeeFilterQualified', fallback: 'Passend' },
];

const EMPLOYEE_STATUS_META = {
  AVAILABLE: {
    labelKey: 'deploy.form.employeeAvailable',
    fallback: 'Verfügbar',
    icon: BadgeCheck,
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  WARNING: {
    labelKey: 'deploy.form.employeeWarning',
    fallback: 'Konflikt',
    icon: AlertTriangle,
    className: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  UNAVAILABLE: {
    labelKey: 'deploy.form.employeeUnavailable',
    fallback: 'Abwesend',
    icon: ShieldAlert,
    className: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
  UNKNOWN: {
    labelKey: 'deploy.form.employeeUnknown',
    fallback: 'Zeit offen',
    icon: CalendarClock,
    className: 'border-muted-foreground/20 bg-muted text-muted-foreground',
  },
};

function employeeLabel(employee) {
  return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || '';
}

function employeeInitials(employee) {
  const first = employee?.firstName?.[0] || '';
  const last = employee?.lastName?.[0] || '';
  return `${first}${last}`.toUpperCase() || 'U';
}

function joinList(values) {
  return Array.isArray(values) ? values.join(', ') : values || '';
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toQueryList(value) {
  return splitList(value).join(',');
}

function extractSchedulingConflicts(error) {
  const data = error?.data || {};
  const conflicts = Array.isArray(data.conflicts)
    ? data.conflicts
    : Array.isArray(data.hardConflicts)
      ? data.hardConflicts
      : [];
  return conflicts.filter(Boolean);
}

function hasCapabilityWarning(employee) {
  return employee?.availability?.conflicts?.some((conflict) => (
    conflict.conflictType === 'SKILL_MISMATCH' ||
    conflict.conflictType === 'CERTIFICATION_MISSING'
  ));
}

function hasHardAvailabilityConflict(employee) {
  return employee?.availability?.conflicts?.some((conflict) => conflict.severity === 'HARD');
}

function matchesEmployeeFilter(employee, filter) {
  if (filter === 'ALL') return true;
  if (filter === 'QUALIFIED') return !hasCapabilityWarning(employee);
  return employee?.availability?.status === filter;
}

function formatHours(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function normalizeDateTime(value, { isFullDay, isEnd } = {}) {
  if (!value) return value;
  if (isFullDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${isEnd ? '23:59:59' : '00:00:00'}`;
  }
  return value;
}

function normalizeReferenceId(value) {
  return value?._id || value?.id || value || '';
}

// Format a stored ISO datetime for the date / datetime-local input, in LOCAL
// time. A raw ISO slice would show UTC and — for full-day, whose input is
// type="date" and expects YYYY-MM-DD — produce an invalid value (empty field).
function toDateInputValue(iso, isFullDay) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return isFullDay ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentForm({ open, onOpenChange, defaultValues, prefill }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const assignmentSchema = useMemo(() => getCreateAssignmentSchema(t), [t]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('ALL');
  const [formConflicts, setFormConflicts] = useState([]);
  const [pendingConflictSubmission, setPendingConflictSubmission] = useState(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const debouncedEmployeeSearch = useDebounce(employeeSearch, 250);

  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(assignmentSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      const values = {
        ...BLANK,
        ...defaultValues,
        employeeIds: defaultValues.employeeId ? [defaultValues.employeeId._id || defaultValues.employeeId] : [],
        orderId: normalizeReferenceId(defaultValues.orderId),
        projectId: normalizeReferenceId(defaultValues.projectId),
        customerId: normalizeReferenceId(defaultValues.customerId),
        siteId: normalizeReferenceId(defaultValues.siteId),
        // Keep text inputs as controlled strings — the API returns null for empty
        // optional fields, which would otherwise fail validation / warn in React.
        title: defaultValues.title || '',
        instructions: defaultValues.instructions || '',
        startDatetime: toDateInputValue(defaultValues.startDatetime, defaultValues.isFullDay),
        endDatetime: toDateInputValue(defaultValues.endDatetime, defaultValues.isFullDay),
        requiredSkills: joinList(defaultValues.requiredSkills),
        recommendedSkills: joinList(defaultValues.recommendedSkills),
        requiredCertifications: joinList(defaultValues.requiredCertifications),
        recommendedCertifications: joinList(defaultValues.recommendedCertifications),
        recurrence: defaultValues.recurrence || (defaultValues.recurrenceGroupId ? DEFAULT_RECURRENCE : null),
      };
      reset(values);
    } else {
      const values = { ...BLANK, ...(prefill || {}) };
      values.orderId = normalizeReferenceId(values.orderId);
      values.projectId = normalizeReferenceId(values.projectId);
      values.customerId = normalizeReferenceId(values.customerId);
      values.siteId = normalizeReferenceId(values.siteId);
      if (prefill?.startDatetime) values.startDatetime = prefill.startDatetime.slice(0, 16);
      if (prefill?.endDatetime) values.endDatetime = prefill.endDatetime.slice(0, 16);
      reset(values);
    }
  }, [defaultValues, prefill, open, reset]);

  const assignmentType = useWatch({ control, name: 'assignmentType' });
  const priority = useWatch({ control, name: 'priority' });
  const startDatetime = useWatch({ control, name: 'startDatetime' });
  const endDatetime = useWatch({ control, name: 'endDatetime' });
  const isFullDay = useWatch({ control, name: 'isFullDay' });
  const isCustomerAppointment = useWatch({ control, name: 'isCustomerAppointment' });
  const recurrenceValue = useWatch({ control, name: 'recurrence' });
  const selectedEmployees = useWatch({ control, name: 'employeeIds' }) || [];
  const requiredSkills = useWatch({ control, name: 'requiredSkills' });
  const recommendedSkills = useWatch({ control, name: 'recommendedSkills' });
  const requiredCertifications = useWatch({ control, name: 'requiredCertifications' });
  const recommendedCertifications = useWatch({ control, name: 'recommendedCertifications' });
  const confirmationMethod = useWatch({ control, name: 'appointment.confirmationMethod' });
  const appointmentWindow = useWatch({ control, name: 'appointment.appointmentWindow' }) || '';
  const showRecurrence = Boolean(recurrenceValue);
  const assignmentMeta = ASSIGNMENT_TYPE_META[assignmentType];
  const AssignmentIcon = assignmentMeta?.icon || CalendarClock;
  const priorityMeta = PRIORITY_META[priority];
  const PriorityIcon = priorityMeta?.icon;

  const employeeStartDatetime = normalizeDateTime(startDatetime, { isFullDay });
  const employeeEndDatetime = normalizeDateTime(endDatetime, { isFullDay, isEnd: true });
  const { data: employees = [], isFetching: employeesFetching } = useDeployEmployees({
    enabled: open,
    search: debouncedEmployeeSearch,
    limit: EMPLOYEE_PICKER_LIMIT,
    startDatetime: employeeStartDatetime,
    endDatetime: employeeEndDatetime,
    requiredSkills: toQueryList(requiredSkills),
    recommendedSkills: toQueryList(recommendedSkills),
    requiredCertifications: toQueryList(requiredCertifications),
    recommendedCertifications: toQueryList(recommendedCertifications),
    includeEmployeeIds: selectedEmployees.join(','),
  });

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee._id, employee])),
    [employees],
  );

  const filteredEmployees = useMemo(
    () => employees.filter((employee) => matchesEmployeeFilter(employee, employeeFilter)),
    [employees, employeeFilter],
  );

  const hiddenEmployeeCount = Math.max(0, employees.length - filteredEmployees.length);

  const handleAssignmentConflict = (err, variables) => {
    const conflicts = extractSchedulingConflicts(err);
    if (!conflicts.length) return false;

    const isUpdateConflict = Boolean(variables?.id);
    setPendingConflictSubmission({
      type: isUpdateConflict ? 'update' : 'create',
      id: variables?.id || defaultValues?._id || null,
      data: isUpdateConflict ? variables.data : variables,
    });
    setFormConflicts(conflicts);
    setConflictDialogOpen(true);
    return true;
  };

  const clearConflictState = () => {
    setFormConflicts([]);
    setPendingConflictSubmission(null);
    setConflictDialogOpen(false);
  };

  const { create, update } = useAssignmentMutations({
    onCreate: () => {
      clearConflictState();
      onOpenChange(false);
    },
    onUpdate: () => {
      clearConflictState();
      onOpenChange(false);
    },
    onConflict: handleAssignmentConflict,
  });

  const submit = async (data) => {
    const cleaned = {
      ...data,
      orderId: data.orderId || null,
      projectId: data.projectId || null,
      customerId: data.customerId || null,
      siteId: data.siteId || null,
      title: data.title || null,
      startDatetime: normalizeDateTime(data.startDatetime, { isFullDay: data.isFullDay }),
      endDatetime: normalizeDateTime(data.endDatetime, { isFullDay: data.isFullDay, isEnd: true }),
      instructions: data.instructions || null,
      requiredSkills: splitList(data.requiredSkills),
      recommendedSkills: splitList(data.recommendedSkills),
      requiredCertifications: splitList(data.requiredCertifications),
      recommendedCertifications: splitList(data.recommendedCertifications),
      colorCode: data.colorCode || null,
      recurrence: showRecurrence ? data.recurrence : null,
      appointment: isCustomerAppointment ? data.appointment : null,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: defaultValues._id, data: { ...cleaned, version: defaultValues.version } });
      } else {
        await create.mutateAsync(cleaned);
      }
    } catch {
      // Mutation onError renders toast or conflict dialog.
    }
  };

  const handleConflictOverride = async (overrideReason) => {
    if (!pendingConflictSubmission?.data) return;

    const data = {
      ...pendingConflictSubmission.data,
      overrideConflicts: true,
      overrideReason,
    };

    try {
      if (pendingConflictSubmission.type === 'update') {
        await update.mutateAsync({ id: pendingConflictSubmission.id, data });
      } else {
        await create.mutateAsync(data);
      }
    } catch {
      // Mutation onError renders toast or conflict dialog.
    }
  };

  const handleConflictCancel = () => {
    clearConflictState();
  };

  const isPending = create.isPending || update.isPending;
  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      setEmployeeSearch('');
      setEmployeeFilter('ALL');
      clearConflictState();
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader className="pr-14">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <AssignmentIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-xl">
                {isEdit
                  ? t('deploy.assignments.edit', 'Einsatz bearbeiten')
                  : t('deploy.assignments.create', 'Einsatz erstellen')}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isEdit
                  ? t('deploy.assignments.updateDesc', 'Einsatzdetails aktualisieren')
                  : t('deploy.assignments.createDesc', 'Neuen Einsatz planen und zuweisen')}
              </DialogDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                {assignmentMeta && (
                  <Badge variant="secondary" className="gap-1.5 rounded-lg px-2.5 py-1">
                    <AssignmentIcon className={`h-3.5 w-3.5 ${assignmentMeta.color}`} />
                    {translateMetaLabel(t, assignmentMeta)}
                  </Badge>
                )}
                {priorityMeta && (
                  <Badge variant="outline" className="gap-1.5 rounded-lg px-2.5 py-1">
                    {PriorityIcon && <PriorityIcon className={`h-3.5 w-3.5 ${priorityMeta.color}`} />}
                    <span className={priorityMeta.color}>{translateMetaLabel(t, priorityMeta)}</span>
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <FormBody className="bg-muted/15">
            {/* Basic Info */}
            <FormSection title={t('deploy.form.basicInfo', 'Grundinformationen')} className="border-b border-border/70 pb-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t('deploy.form.assignmentType', 'Einsatztyp')} required error={errors.assignmentType?.message}>
                  <Select
                    value={assignmentType}
                    onValueChange={(v) => setValue('assignmentType', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11 rounded-xl text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSIGNMENT_TYPE_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        const label = translateMetaLabel(t, meta);
                        return (
                          <SelectItem key={key} value={key} textValue={label}>
                            <span className="flex items-center gap-1.5">
                              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                              {label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label={t('deploy.form.priority', 'Priorität')} error={errors.priority?.message}>
                  <Select
                    value={priority}
                    onValueChange={(v) => setValue('priority', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11 rounded-xl text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        const label = translateMetaLabel(t, meta);
                        return (
                          <SelectItem key={key} value={key} textValue={label}>
                            <span className="flex items-center gap-1.5">
                              {Icon && <Icon className={`h-3.5 w-3.5 ${meta.color}`} />}
                              <span className={meta.color}>{label}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <FormField label={t('deploy.form.title', 'Titel')} error={errors.title?.message}>
                <Input className="h-11 rounded-xl text-sm" placeholder={t('deploy.form.titlePlaceholder', 'Optional - Kurzbeschreibung')} {...register('title')} />
              </FormField>

              <FormField label={t('deploy.form.employees', 'Mitarbeiter')} required error={errors.employeeIds?.message}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-11 w-full justify-between rounded-xl px-3.5 text-sm font-normal">
                      <span className="flex min-w-0 items-center gap-2">
                        <UsersRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {selectedEmployees.length > 0
                            ? t('deploy.form.employeesSelected', '{count} ausgewählt').replace('{count}', selectedEmployees.length)
                            : t('deploy.form.selectEmployees', 'Mitarbeiter auswählen')}
                        </span>
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl p-0" align="start">
                    <div className="space-y-2 border-b border-border p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={employeeSearch}
                          onChange={(event) => setEmployeeSearch(event.target.value)}
                          placeholder={t('deploy.form.searchEmployees', 'Mitarbeiter suchen...')}
                          className="h-10 rounded-xl pl-9 text-sm"
                        />
                      </div>
                      <div className="flex gap-1 overflow-x-auto">
                        {EMPLOYEE_FILTERS.map((filter) => (
                          <button
                            key={filter.value}
                            type="button"
                            onClick={() => setEmployeeFilter(filter.value)}
                            className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                              employeeFilter === filter.value
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {t(filter.labelKey, filter.fallback)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-[340px] overflow-y-auto p-1.5">
                      {filteredEmployees.map((emp) => {
                        const isSelected = selectedEmployees.includes(emp._id);
                        const status = emp.availability?.status || 'UNKNOWN';
                        const statusMeta = EMPLOYEE_STATUS_META[status] || EMPLOYEE_STATUS_META.UNKNOWN;
                        const StatusIcon = statusMeta.icon;
                        const isUnavailable = hasHardAvailabilityConflict(emp);
                        const isDisabled = isUnavailable && !isSelected;
                        const skills = emp.schedulingSkills || [];
                        const certifications = emp.schedulingCertifications || [];
                        const role = emp.position || emp.roleName || emp.department || emp.email;
                        const workload = emp.workload || {};
                        const primaryConflict = emp.availability?.conflicts?.[0];
                        return (
                          <button
                            key={emp._id}
                            type="button"
                            disabled={isDisabled}
                            aria-pressed={isSelected}
                            onClick={() => {
                              const next = isSelected
                                ? selectedEmployees.filter((id) => id !== emp._id)
                                : isEdit
                                  ? [emp._id]
                                  : [...selectedEmployees, emp._id];
                              setValue('employeeIds', next, { shouldValidate: true });
                            }}
                            className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {employeeInitials(emp)}
                            </span>
                            <span className="min-w-0 flex-1 text-left">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-medium text-foreground">{employeeLabel(emp)}</span>
                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${statusMeta.className}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {t(statusMeta.labelKey, statusMeta.fallback)}
                                </span>
                              </span>
                              {role && (
                                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                  <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{role}</span>
                                </span>
                              )}
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                {t('deploy.form.employeeWorkload', '{percent}% Auslastung · {hours}h geplant')
                                  .replace('{percent}', String(Math.round(workload.utilizationPercent || 0)))
                                  .replace('{hours}', formatHours(workload.assignedHours))}
                              </span>
                              {primaryConflict && (
                                <span className="mt-1 block truncate text-xs text-amber-700 dark:text-amber-300">
                                  {primaryConflict.description}
                                </span>
                              )}
                              {(skills.length > 0 || certifications.length > 0) && (
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                  {skills.slice(0, 2).map((skill) => (
                                    <span key={`skill-${skill}`} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                      {skill}
                                    </span>
                                  ))}
                                  {certifications.slice(0, 2).map((certification) => (
                                    <span key={`cert-${certification}`} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                      {certification}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </span>
                            <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                              {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                            </div>
                          </button>
                        );
                      })}
                      {employeesFetching && filteredEmployees.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {t('common.loadingUsers', 'Benutzer werden geladen...')}
                        </p>
                      )}
                      {!employeesFetching && filteredEmployees.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          {t('deploy.form.noEmployees', 'Keine Mitarbeiter gefunden')}
                        </p>
                      )}
                    </div>
                    {hiddenEmployeeCount > 0 && (
                      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                        {t('deploy.form.employeeResultsLimited', '{count} weitere Treffer ausgeblendet').replace('{count}', hiddenEmployeeCount)}
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
                {selectedEmployees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedEmployees.map((id) => {
                      const emp = employeeById.get(id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {emp ? employeeLabel(emp) : id}
                          <button
                            type="button"
                            onClick={() => setValue('employeeIds', selectedEmployees.filter((eid) => eid !== id), { shouldValidate: true })}
                            className="rounded-full hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </FormField>
            </FormSection>

            <AssignmentWorkContextFields
              control={control}
              setValue={setValue}
              errors={errors}
              defaultValues={defaultValues}
              prefill={prefill}
              open={open}
              t={t}
            />

            {/* Schedule */}
            <FormSection title={t('deploy.form.scheduling', 'Zeitplanung')} className="border-b border-border/70 pb-6">
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-border/70 bg-background/50 px-3 py-2.5">
                <Switch
                  checked={isFullDay}
                  onCheckedChange={(v) => setValue('isFullDay', v)}
                />
                <Label className="text-sm font-medium">{t('deploy.form.fullDay', 'Ganztägig')}</Label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t('deploy.form.start', 'Start')} required error={errors.startDatetime?.message}>
                  <Input
                    type={isFullDay ? 'date' : 'datetime-local'}
                    className="h-11 rounded-xl text-sm"
                    {...register('startDatetime')}
                  />
                </FormField>
                <FormField label={t('deploy.form.end', 'Ende')} required error={errors.endDatetime?.message}>
                  <Input
                    type={isFullDay ? 'date' : 'datetime-local'}
                    className="h-11 rounded-xl text-sm"
                    {...register('endDatetime')}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Instructions */}
            <FormField label={t('deploy.form.instructions', 'Anweisungen')} error={errors.instructions?.message}>
              <Textarea
                className="min-h-24 rounded-xl text-sm"
                placeholder={t('deploy.form.instructionsPlaceholder', 'Spezielle Hinweise, Zugangsinfos, ...')}
                {...register('instructions')}
              />
            </FormField>

            <FormSection title={t('deploy.form.capabilities', 'Qualifikationen')} className="border-y border-border/70 py-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={t('deploy.form.requiredSkills', 'Erforderliche Skills')} error={errors.requiredSkills?.message}>
                  <Input
                    className="h-11 rounded-xl text-sm"
                    placeholder={t('deploy.form.commaSeparated', 'Kommagetrennt')}
                    {...register('requiredSkills')}
                  />
                </FormField>
                <FormField label={t('deploy.form.recommendedSkills', 'Empfohlene Skills')} error={errors.recommendedSkills?.message}>
                  <Input
                    className="h-11 rounded-xl text-sm"
                    placeholder={t('deploy.form.commaSeparated', 'Kommagetrennt')}
                    {...register('recommendedSkills')}
                  />
                </FormField>
                <FormField label={t('deploy.form.requiredCertifications', 'Erforderliche Zertifikate')} error={errors.requiredCertifications?.message}>
                  <Input
                    className="h-11 rounded-xl text-sm"
                    placeholder={t('deploy.form.commaSeparated', 'Kommagetrennt')}
                    {...register('requiredCertifications')}
                  />
                </FormField>
                <FormField label={t('deploy.form.recommendedCertifications', 'Empfohlene Zertifikate')} error={errors.recommendedCertifications?.message}>
                  <Input
                    className="h-11 rounded-xl text-sm"
                    placeholder={t('deploy.form.commaSeparated', 'Kommagetrennt')}
                    {...register('recommendedCertifications')}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Toggles */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setValue('recurrence', showRecurrence ? null : DEFAULT_RECURRENCE, { shouldValidate: true })}
                className="flex items-center gap-2 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Repeat className="h-4 w-4" />
                {showRecurrence ? t('deploy.form.removeRecurrence', 'Wiederholung entfernen') : t('deploy.form.addRecurrence', 'Wiederholung hinzufügen')}
              </button>

              <div className="flex items-center gap-3">
                <Switch
                  checked={isCustomerAppointment}
                  onCheckedChange={(v) => setValue('isCustomerAppointment', v)}
                />
                <Label className="text-sm font-medium">{t('deploy.form.customerAppointment', 'Kundentermin')}</Label>
              </div>
            </div>

            {/* Recurrence */}
            {showRecurrence && (
              <AssignmentRecurrenceForm
                register={register}
                errors={errors}
                control={control}
                setValue={setValue}
              />
            )}

            {/* Appointment Details */}
            {isCustomerAppointment && (
              <FormSection title={t('deploy.form.appointmentDetails', 'Termindetails')} className="border-t border-border/70 pt-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label={t('deploy.form.contactName', 'Kontaktname')} error={errors?.appointment?.customerContactName?.message}>
                    <Input className="h-11 rounded-xl text-sm" {...register('appointment.customerContactName')} />
                  </FormField>
                  <FormField label={t('deploy.form.phone', 'Telefon')} error={errors?.appointment?.customerContactPhone?.message}>
                    <Input className="h-11 rounded-xl text-sm" {...register('appointment.customerContactPhone')} />
                  </FormField>
                  <FormField label={t('deploy.form.email', 'E-Mail')} error={errors?.appointment?.customerContactEmail?.message}>
                    <Input className="h-11 rounded-xl text-sm" type="email" {...register('appointment.customerContactEmail')} />
                  </FormField>
                  <div className="sm:col-span-2">
                    <AppointmentTimeWindowField
                      key={appointmentWindow || 'empty-appointment-window'}
                      value={appointmentWindow}
                      error={errors?.appointment?.appointmentWindow?.message}
                      register={register}
                      setValue={setValue}
                      t={t}
                      disabled={isPending}
                    />
                  </div>
                </div>
                <FormField label={t('deploy.form.confirmationMethod', 'Bestätigungsmethode')} error={errors?.appointment?.confirmationMethod?.message}>
                  <Select
                    value={confirmationMethod || ''}
                    onValueChange={(v) => setValue('appointment.confirmationMethod', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-11 rounded-xl text-sm">
                      <SelectValue placeholder={t('deploy.form.selectPlaceholder', 'Auswählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMAIL">E-Mail</SelectItem>
                      <SelectItem value="SMS">SMS</SelectItem>
                      <SelectItem value="PHONE">Telefon</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t('deploy.form.customerNotes', 'Kundenhinweise')} error={errors?.appointment?.customerNotes?.message}>
                  <Textarea className="min-h-20 rounded-xl text-sm" placeholder={t('deploy.form.customerNotesPlaceholder', 'Zugangsinfos, Parkplatz, ...')} {...register('appointment.customerNotes')} />
                </FormField>
              </FormSection>
            )}
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {t('deploy.common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('deploy.common.save', 'Speichern') : t('deploy.common.create', 'Erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConflictDialog
      open={conflictDialogOpen}
      conflicts={formConflicts}
      onOverride={handleConflictOverride}
      onCancel={handleConflictCancel}
    />
    </>
  );
}
