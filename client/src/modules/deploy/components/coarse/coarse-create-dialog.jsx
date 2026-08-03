'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Loader2,
  NotebookPen,
  Percent,
  UserRound,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
import { CoarseProjectPicker } from './coarse-project-picker';
import { useCoarseMutations } from '../../hooks/use-coarse-mutations';

const PERCENT_OPTIONS = [25, 50, 75, 100];

function CoarseCreateForm({
  onOpenChange,
  defaultEmployeeId,
  defaultProjectId,
  defaultWeek,
  year,
}) {
  const { t } = useLanguage();
  const { data: employees = [] } = useDeployEmployees();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || '');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [calendarWeek, setCalendarWeek] = useState(defaultWeek);
  const [allocationPercent, setAllocationPercent] = useState(25);
  const [notes, setNotes] = useState('');

  const { create } = useCoarseMutations({
    onCreate: () => onOpenChange(false),
  });

  const submit = () => {
    if (!employeeId || !projectId || !calendarWeek) return;

    create.mutate({
      employeeId,
      projectId,
      calendarYear: year,
      calendarWeek,
      allocationPercent,
      notes: notes || null,
    });
  };
  const canSubmit = !!employeeId && !!projectId && !!calendarWeek && !create.isPending;

  return (
    <>
      <DialogHeader className="border-b border-border/70 bg-muted/20 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-xl font-semibold tracking-normal">
              {t('deploy.coarse.createAllocation', 'Create allocation')}
            </DialogTitle>
            <DialogDescription className="text-sm leading-5">
              {t('deploy.coarse.createAllocationDesc', 'Assign an employee to a project for coarse planning.')}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-5 px-6 py-5">
        <FormField label={t('deploy.coarse.employee', 'Employee')} required>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/70 text-sm shadow-sm">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder={t('deploy.coarse.selectEmployee', 'Select employee')} />
              </span>
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee._id} value={employee._id} className="text-sm">
                  {employee.firstName} {employee.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('deploy.coarse.project', 'Project')} required>
          <CoarseProjectPicker
            value={projectId}
            defaultProjectId={defaultProjectId}
            onChange={setProjectId}
            disabled={create.isPending}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label={t('deploy.coarse.week', 'Week')} required>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                min={1}
                max={53}
                className="h-11 rounded-xl border-border/70 bg-background/70 pl-9 text-sm shadow-sm"
                value={calendarWeek}
                onChange={(event) => setCalendarWeek(Number(event.target.value))}
              />
            </div>
          </FormField>

          <FormField label={t('deploy.coarse.allocation', 'Allocation')} required>
            <Select
              value={String(allocationPercent)}
              onValueChange={(value) => setAllocationPercent(Number(value))}
            >
              <SelectTrigger className="h-11 rounded-xl border-border/70 bg-background/70 text-sm shadow-sm">
                <span className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {PERCENT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)} className="text-sm">
                    {value}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label={t('deploy.coarse.notes', 'Notes')}>
          <div className="relative">
            <NotebookPen className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Textarea
              rows={5}
              className="min-h-[132px] resize-y rounded-xl border-border/70 bg-background/70 pl-9 text-sm shadow-sm"
              placeholder={t('deploy.coarse.notesPlaceholder', 'Notes for this allocation...')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </FormField>
      </div>

      <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          className="h-10 rounded-xl px-4"
          onClick={() => onOpenChange(false)}
          disabled={create.isPending}
        >
          {t('deploy.common.cancel', 'Cancel')}
        </Button>
        <Button
          size="sm"
          className="h-10 rounded-xl px-5 shadow-sm"
          onClick={submit}
          disabled={!canSubmit}
        >
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('deploy.common.create', 'Create')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CoarseCreateDialog({
  open,
  onOpenChange,
  defaultEmployeeId,
  defaultProjectId,
  defaultWeek,
  year,
}) {
  const formKey = `${defaultEmployeeId || 'none'}-${defaultProjectId || 'none'}-${defaultWeek}-${year}-${open ? 'open' : 'closed'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <CoarseCreateForm
          key={formKey}
          onOpenChange={onOpenChange}
          defaultEmployeeId={defaultEmployeeId}
          defaultProjectId={defaultProjectId}
          defaultWeek={defaultWeek}
          year={year}
        />
      </DialogContent>
    </Dialog>
  );
}
