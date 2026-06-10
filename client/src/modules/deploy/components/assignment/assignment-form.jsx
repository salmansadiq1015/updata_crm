'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createAssignmentSchema } from '../../validations/assignment';
import { useAssignmentMutations } from '../../hooks/use-assignment-mutations';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
import { AssignmentRecurrenceForm } from './assignment-recurrence-form';
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
import { FormField, FormSection, FormBody } from '@/components/ui/form-field';
import { Loader2, CalendarClock, Repeat, UserPlus, Check, ChevronsUpDown, X } from 'lucide-react';
import { ASSIGNMENT_TYPE_META, PRIORITY_META } from '../../constants/deploy-constants';

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

export function AssignmentForm({ open, onOpenChange, defaultValues, prefill }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;

  const { data: employees = [] } = useDeployEmployees({ enabled: open });

  const { create, update } = useAssignmentMutations({
    onCreate: () => onOpenChange(false),
    onUpdate: () => onOpenChange(false),
  });

  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createAssignmentSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      const values = {
        ...BLANK,
        ...defaultValues,
        employeeIds: defaultValues.employeeId ? [defaultValues.employeeId._id || defaultValues.employeeId] : [],
        startDatetime: defaultValues.startDatetime?.slice(0, 16) || '',
        endDatetime: defaultValues.endDatetime?.slice(0, 16) || '',
        recurrence: defaultValues.recurrence || (defaultValues.recurrenceGroupId ? DEFAULT_RECURRENCE : null),
      };
      reset(values);
    } else {
      const values = { ...BLANK, ...(prefill || {}) };
      if (prefill?.startDatetime) values.startDatetime = prefill.startDatetime.slice(0, 16);
      if (prefill?.endDatetime) values.endDatetime = prefill.endDatetime.slice(0, 16);
      reset(values);
    }
  }, [defaultValues, prefill, open, reset]);

  const assignmentType = useWatch({ control, name: 'assignmentType' });
  const priority = useWatch({ control, name: 'priority' });
  const isFullDay = useWatch({ control, name: 'isFullDay' });
  const isCustomerAppointment = useWatch({ control, name: 'isCustomerAppointment' });
  const recurrenceValue = useWatch({ control, name: 'recurrence' });
  const selectedEmployees = useWatch({ control, name: 'employeeIds' }) || [];
  const confirmationMethod = useWatch({ control, name: 'appointment.confirmationMethod' });
  const showRecurrence = Boolean(recurrenceValue);

  const submit = async (data) => {
    const cleaned = {
      ...data,
      orderId: data.orderId || null,
      projectId: data.projectId || null,
      customerId: data.customerId || null,
      siteId: data.siteId || null,
      title: data.title || null,
      instructions: data.instructions || null,
      colorCode: data.colorCode || null,
      recurrence: showRecurrence ? data.recurrence : null,
      appointment: isCustomerAppointment ? data.appointment : null,
    };

    if (isEdit) {
      await update.mutateAsync({ id: defaultValues._id, data: { ...cleaned, version: defaultValues.version } });
    } else {
      await create.mutateAsync(cleaned);
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            {isEdit
              ? t('deploy.assignments.edit', 'Einsatz bearbeiten')
              : t('deploy.assignments.create', 'Einsatz erstellen')}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t('deploy.assignments.updateDesc', 'Einsatzdetails aktualisieren')
              : t('deploy.assignments.createDesc', 'Neuen Einsatz planen und zuweisen')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <FormBody>
            {/* Basic Info */}
            <FormSection title={t('deploy.form.basicInfo', 'Grundinformationen')}>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('deploy.form.assignmentType', 'Einsatztyp')} required error={errors.assignmentType?.message}>
                  <Select
                    value={assignmentType}
                    onValueChange={(v) => setValue('assignmentType', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSIGNMENT_TYPE_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        return (
                          <SelectItem key={key} value={key} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                              {meta.label}
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
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          <span className={meta.color}>{meta.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <FormField label={t('deploy.form.title', 'Titel')} error={errors.title?.message}>
                <Input className="h-9 text-xs" placeholder={t('deploy.form.titlePlaceholder', 'Optional – Kurzbeschreibung')} {...register('title')} />
              </FormField>

              <FormField label={t('deploy.form.employees', 'Mitarbeiter')} required error={errors.employeeIds?.message}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="h-9 w-full justify-between text-xs font-normal">
                      {selectedEmployees.length > 0
                        ? t('deploy.form.employeesSelected', '{count} ausgewählt').replace('{count}', selectedEmployees.length)
                        : t('deploy.form.selectEmployees', 'Mitarbeiter auswählen')}
                      <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <div className="max-h-[200px] overflow-y-auto p-1">
                      {employees.map((emp) => {
                        const isSelected = selectedEmployees.includes(emp._id);
                        return (
                          <button
                            key={emp._id}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? selectedEmployees
                                : isEdit
                                  ? [emp._id]
                                  : [...selectedEmployees, emp._id];
                              setValue('employeeIds', next, { shouldValidate: true });
                            }}
                            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            {emp.firstName} {emp.lastName}
                          </button>
                        );
                      })}
                      {employees.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          {t('deploy.form.noEmployees', 'Keine Mitarbeiter gefunden')}
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedEmployees.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedEmployees.map((id) => {
                      const emp = employees.find((e) => e._id === id);
                      if (!emp) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                          {emp.firstName} {emp.lastName}
                          <button
                            type="button"
                            onClick={() => setValue('employeeIds', selectedEmployees.filter((eid) => eid !== id), { shouldValidate: true })}
                            className="hover:text-destructive"
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

            {/* Schedule */}
            <FormSection title={t('deploy.form.scheduling', 'Zeitplanung')}>
              <div className="flex items-center gap-2 mb-2">
                <Switch
                  checked={isFullDay}
                  onCheckedChange={(v) => setValue('isFullDay', v)}
                />
                <Label className="text-xs">{t('deploy.form.fullDay', 'Ganztägig')}</Label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('deploy.form.start', 'Start')} required error={errors.startDatetime?.message}>
                  <Input
                    type={isFullDay ? 'date' : 'datetime-local'}
                    className="h-9 text-xs"
                    {...register('startDatetime')}
                  />
                </FormField>
                <FormField label={t('deploy.form.end', 'Ende')} required error={errors.endDatetime?.message}>
                  <Input
                    type={isFullDay ? 'date' : 'datetime-local'}
                    className="h-9 text-xs"
                    {...register('endDatetime')}
                  />
                </FormField>
              </div>
            </FormSection>

            {/* Instructions */}
            <FormField label={t('deploy.form.instructions', 'Anweisungen')} error={errors.instructions?.message}>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder={t('deploy.form.instructionsPlaceholder', 'Spezielle Hinweise, Zugangsinfos, ...')}
                {...register('instructions')}
              />
            </FormField>

            {/* Toggles */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setValue('recurrence', showRecurrence ? null : DEFAULT_RECURRENCE, { shouldValidate: true })}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Repeat className="h-3.5 w-3.5" />
                {showRecurrence ? t('deploy.form.removeRecurrence', 'Wiederholung entfernen') : t('deploy.form.addRecurrence', 'Wiederholung hinzufügen')}
              </button>

              <div className="flex items-center gap-2">
                <Switch
                  checked={isCustomerAppointment}
                  onCheckedChange={(v) => setValue('isCustomerAppointment', v)}
                />
                <Label className="text-xs">{t('deploy.form.customerAppointment', 'Kundentermin')}</Label>
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
              <FormSection title={t('deploy.form.appointmentDetails', 'Termindetails')}>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t('deploy.form.contactName', 'Kontaktname')} error={errors?.appointment?.customerContactName?.message}>
                    <Input className="h-9 text-xs" {...register('appointment.customerContactName')} />
                  </FormField>
                  <FormField label={t('deploy.form.phone', 'Telefon')} error={errors?.appointment?.customerContactPhone?.message}>
                    <Input className="h-9 text-xs" {...register('appointment.customerContactPhone')} />
                  </FormField>
                  <FormField label={t('deploy.form.email', 'E-Mail')} error={errors?.appointment?.customerContactEmail?.message}>
                    <Input className="h-9 text-xs" type="email" {...register('appointment.customerContactEmail')} />
                  </FormField>
                  <FormField label={t('deploy.form.timeWindow', 'Zeitfenster')} error={errors?.appointment?.appointmentWindow?.message}>
                    <Input className="h-9 text-xs" placeholder={t('deploy.form.timeWindowPlaceholder', 'z.B. 08:00-12:00')} {...register('appointment.appointmentWindow')} />
                  </FormField>
                </div>
                <FormField label={t('deploy.form.confirmationMethod', 'Bestätigungsmethode')} error={errors?.appointment?.confirmationMethod?.message}>
                  <Select
                    value={confirmationMethod || ''}
                    onValueChange={(v) => setValue('appointment.confirmationMethod', v, { shouldValidate: true })}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={t('deploy.form.selectPlaceholder', 'Auswählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMAIL" className="text-xs">E-Mail</SelectItem>
                      <SelectItem value="SMS" className="text-xs">SMS</SelectItem>
                      <SelectItem value="PHONE" className="text-xs">Telefon</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t('deploy.form.customerNotes', 'Kundenhinweise')} error={errors?.appointment?.customerNotes?.message}>
                  <Textarea className="text-xs min-h-[40px]" placeholder={t('deploy.form.customerNotesPlaceholder', 'Zugangsinfos, Parkplatz, ...')} {...register('appointment.customerNotes')} />
                </FormField>
              </FormSection>
            )}
          </FormBody>

          <DialogFooter className="px-6 py-4 border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t('deploy.common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isEdit ? t('deploy.common.save', 'Speichern') : t('deploy.common.create', 'Erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
