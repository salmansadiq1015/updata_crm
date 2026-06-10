'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
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
    create.mutate({
      employeeId,
      projectId,
      calendarYear: year,
      calendarWeek,
      allocationPercent,
      notes: notes || null,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('deploy.coarse.createAllocation', 'Create allocation')}</DialogTitle>
        <DialogDescription>
          {t('deploy.coarse.createAllocationDesc', 'Assign an employee to a project for coarse planning.')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <FormField label={t('deploy.coarse.employee', 'Employee')} required>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t('deploy.form.selectEmployees', 'Select employee')} />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee._id} value={employee._id} className="text-xs">
                  {employee.firstName} {employee.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('deploy.coarse.projectId', 'Project ID')} required>
          <Input
            className="h-9 text-xs"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder={t('deploy.coarse.projectIdPlaceholder', 'Projekt-ID eingeben')}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('deploy.coarse.week', 'Week')} required>
            <Input
              type="number"
              min={1}
              max={53}
              className="h-9 text-xs"
              value={calendarWeek}
              onChange={(event) => setCalendarWeek(Number(event.target.value))}
            />
          </FormField>

          <FormField label={t('deploy.coarse.allocation', 'Allocation')} required>
            <Select
              value={String(allocationPercent)}
              onValueChange={(value) => setAllocationPercent(Number(value))}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERCENT_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)} className="text-xs">
                    {value}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <FormField label={t('deploy.coarse.notes', 'Notes')}>
          <Input
            className="h-9 text-xs"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          {t('deploy.common.cancel', 'Cancel')}
        </Button>
        <Button
          size="sm"
          onClick={submit}
          disabled={!employeeId || !projectId || create.isPending}
        >
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
      <DialogContent className="sm:max-w-[420px]">
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
