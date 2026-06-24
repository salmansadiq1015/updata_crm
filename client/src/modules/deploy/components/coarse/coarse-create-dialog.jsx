'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  FolderKanban,
  Loader2,
  NotebookPen,
  Percent,
  Search,
  UserRound,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
import { getCoarseProjectId, useCoarseProjectOptions } from '../../hooks/use-coarse-project-options';
import { useCoarseMutations } from '../../hooks/use-coarse-mutations';

const PERCENT_OPTIONS = [25, 50, 75, 100];

function getProjectTitle(project) {
  if (!project) return '';
  return [project.projectNumber, project.name].filter(Boolean).join(' - ') || getCoarseProjectId(project);
}

function getProjectMeta(project, fallback) {
  if (!project) return fallback;
  return (
    project.customerName
    || project.customerId?.name
    || project.customerId?.customerNumber
    || project.status
    || fallback
  );
}

function ProjectPicker({ value, defaultProjectId, onChange, disabled }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedId = value || defaultProjectId || '';
  const { hasSearch, options, selectedProject, isFetching } = useCoarseProjectOptions({
    open,
    search,
    selectedId,
  });
  const selected = options.find((project) => getCoarseProjectId(project) === value) || selectedProject;

  const selectProject = (project) => {
    onChange(getCoarseProjectId(project));
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-12 w-full justify-between rounded-xl border-border/70 bg-background/70 px-3.5 py-2.5 text-left font-normal shadow-sm',
            'hover:border-primary/40 hover:bg-muted/40',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderKanban className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate text-sm font-semibold', !selected && 'text-muted-foreground')}>
                {selected
                  ? getProjectTitle(selected)
                  : selectedId || t('deploy.coarse.selectProject', 'Select project')}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {selected
                  ? getProjectMeta(selected, t('deploy.coarse.selectedProject', 'Selected project'))
                  : selectedId
                    ? t('deploy.coarse.loadingProjects', 'Loading projects...')
                  : t('deploy.coarse.typeToSearchProjects', 'Type at least 2 characters to search projects.')}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-xl"
      >
        <div className="border-b border-border/70 bg-muted/20 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('deploy.coarse.searchProjects', 'Search projects...')}
              className="h-10 rounded-xl bg-background pl-9 text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto overscroll-contain p-2">
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {hasSearch
              ? t('deploy.coarse.searchResults', 'Search results')
              : t('deploy.coarse.recentProjects', 'Recent projects')}
          </div>

          {options.map((project) => {
            const id = getCoarseProjectId(project);
            const isSelected = id === value;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectProject(project)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                  'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                  isSelected && 'bg-primary/10',
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {getProjectTitle(project)}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {getProjectMeta(project, t('deploy.coarse.project', 'Project'))}
                    </span>
                    {project.projectNumber && (
                      <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
                        {project.projectNumber}
                      </Badge>
                    )}
                  </span>
                </span>
                <span className={cn(
                  'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                  isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}

          {isFetching && options.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('deploy.coarse.loadingProjects', 'Loading projects...')}
            </div>
          )}

          {!isFetching && options.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {t('deploy.coarse.noProjects', 'No projects found')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('deploy.coarse.typeToSearchProjects', 'Type at least 2 characters to search projects.')}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
          <ProjectPicker
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
