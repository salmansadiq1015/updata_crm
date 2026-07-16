'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Search, Filter, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ORDER_PRIORITY,
  ORDER_STATUS_CONFIG,
  ORDER_TYPE_LABELS,
} from '@/modules/field-ops/constants/field-ops-constants';
import { useDeployEmployees } from '@/modules/deploy/hooks/use-deploy-employees';
import { useAssignmentProjectOptions } from '@/modules/deploy/hooks/use-assignment-work-options';

const STATUS_OPTS = [
  { value: 'all', de: 'Alle Status', en: 'All Statuses' },
  ...Object.entries(ORDER_STATUS_CONFIG).map(([value, config]) => ({
    value,
    de: config.label,
    en: config.labelEn,
  })),
];

const TYPE_OPTS = [
  { value: 'all', de: 'Alle Typen', en: 'All Types' },
  ...Object.entries(ORDER_TYPE_LABELS).map(([value, config]) => ({
    value,
    de: config.label,
    en: config.labelEn,
  })),
];

const PRIORITY_OPTS = [
  { value: 'all', de: 'Alle Prioritaeten', en: 'All Priorities' },
  { value: ORDER_PRIORITY.NORMAL, de: 'Normal', en: 'Normal' },
  { value: ORDER_PRIORITY.HIGH, de: 'Hoch', en: 'High' },
  { value: ORDER_PRIORITY.URGENT, de: 'Dringend', en: 'Urgent' },
];

const activeFilterClass = 'border-primary/40 bg-primary/5 text-primary';

function employeeLabel(employee) {
  return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || employee?._id;
}

function uniqueDepartments(employees) {
  return [...new Set(
    employees
      .map((employee) => String(employee?.department || '').trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

export function FieldOpsOrderFilters({
  search,
  onSearch,
  status,
  onStatus,
  type,
  onType,
  priority,
  onPriority,
  employeeId,
  onEmployee,
  teamId,
  onTeam,
  projectId,
  onProject,
  dateFrom,
  onDateFrom,
  dateTo,
  onDateTo,
  onClear,
}) {
  const { locale: lang } = useLanguage();
  const [projectSearch, setProjectSearch] = useState('');
  const debouncedProjectSearch = useDebounce(projectSearch, 250);
  const { data: employees = [] } = useDeployEmployees({ limit: 100 });
  const { data: projects = [], isFetching: projectsFetching } = useAssignmentProjectOptions({
    search: debouncedProjectSearch,
    limit: 40,
  });

  const departments = useMemo(() => uniqueDepartments(employees), [employees]);
  const hasFilters = Boolean(
    search ||
    (status && status !== 'all') ||
    (type && type !== 'all') ||
    (priority && priority !== 'all') ||
    (employeeId && employeeId !== 'all') ||
    (teamId && teamId !== 'all') ||
    (projectId && projectId !== 'all') ||
    dateFrom ||
    dateTo,
  );
  const localize = (option) => (lang === 'de' ? option.de : option.en);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Separator orientation="vertical" className="h-5" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={lang === 'de' ? 'Auftraege, Kunde, Projekt...' : 'Orders, customer, project...'}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            className="h-8 w-64 rounded-full border-dashed pl-8 text-sm"
          />
        </div>
        <Select value={status} onValueChange={onStatus}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[130px] rounded-full border-dashed text-xs', status !== 'all' && activeFilterClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{localize(option)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={onType}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[140px] rounded-full border-dashed text-xs', type !== 'all' && activeFilterClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{localize(option)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={onPriority}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[150px] rounded-full border-dashed text-xs', priority !== 'all' && activeFilterClass)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{localize(option)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
            <X className="mr-1 h-3.5 w-3.5" />
            {lang === 'de' ? 'Zuruecksetzen' : 'Reset'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-7">
        <Select value={employeeId} onValueChange={onEmployee}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[170px] rounded-full border-dashed text-xs', employeeId !== 'all' && activeFilterClass)}>
            <SelectValue placeholder={lang === 'de' ? 'Mitarbeiter' : 'Employee'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === 'de' ? 'Alle Mitarbeiter' : 'All Employees'}</SelectItem>
            {employees.map((employee) => (
              <SelectItem key={employee._id} value={employee._id}>
                {employeeLabel(employee)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={teamId} onValueChange={onTeam}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[160px] rounded-full border-dashed text-xs', teamId !== 'all' && activeFilterClass)}>
            <SelectValue placeholder={lang === 'de' ? 'Team' : 'Team'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === 'de' ? 'Alle Teams' : 'All Teams'}</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department} value={department}>{department}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={lang === 'de' ? 'Projekt suchen...' : 'Search project...'}
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            className="h-8 w-44 rounded-full border-dashed pl-8 text-sm"
          />
        </div>
        <Select value={projectId} onValueChange={onProject}>
          <SelectTrigger className={cn('h-8 w-auto min-w-[180px] rounded-full border-dashed text-xs', projectId !== 'all' && activeFilterClass)}>
            <SelectValue placeholder={projectsFetching ? (lang === 'de' ? 'Laedt...' : 'Loading...') : (lang === 'de' ? 'Projekt' : 'Project')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === 'de' ? 'Alle Projekte' : 'All Projects'}</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>{project.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => onDateFrom(event.target.value)}
          className={cn('h-8 w-[148px] rounded-full border-dashed text-xs', dateFrom && activeFilterClass)}
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => onDateTo(event.target.value)}
          className={cn('h-8 w-[148px] rounded-full border-dashed text-xs', dateTo && activeFilterClass)}
        />
      </div>
    </div>
  );
}
