'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useSchedulingStore } from '../../stores/scheduling-store';
import {
  ASSIGNMENT_TYPE_META,
  ASSIGNMENT_STATUS_META,
  translateMetaLabel,
} from '../../constants/deploy-constants';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';

export function FilterBar() {
  const { t } = useLanguage();
  const { filters, setFilters, resetFilters } = useSchedulingStore();

  const { data: employees = [] } = useDeployEmployees();

  const departments = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const emp of employees) {
      const dept = emp.department;
      if (dept && !seen.has(dept)) {
        seen.add(dept);
        result.push(dept);
      }
    }
    return result.sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const hasFilters = filters.assignmentType || filters.status || filters.employeeIds?.length || filters.teamId;

  return (
    <div className="flex items-center gap-2">
      {departments.length > 0 && (
        <Select
          value={filters.teamId || ''}
          onValueChange={(v) => setFilters({ teamId: v || null })}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder={t('deploy.filters.team', 'Team')} />
          </SelectTrigger>
          <SelectContent>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept} className="text-xs">
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.employeeIds?.[0] || ''}
        onValueChange={(v) => setFilters({ employeeIds: v ? [v] : [] })}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder={t('deploy.filters.employee', 'Mitarbeiter')} />
        </SelectTrigger>
        <SelectContent>
          {employees.map((emp) => (
            <SelectItem key={emp._id} value={emp._id} className="text-xs">
              {emp.firstName} {emp.lastName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.assignmentType || ''}
        onValueChange={(v) => setFilters({ assignmentType: v || null })}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder={t('deploy.filters.type', 'Typ')} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ASSIGNMENT_TYPE_META).map(([key, meta]) => (
            <SelectItem key={key} value={key} className="text-xs">
              {translateMetaLabel(t, meta)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status || ''}
        onValueChange={(v) => setFilters({ status: v || null })}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder={t('deploy.filters.status', 'Status')} />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ASSIGNMENT_STATUS_META).map(([key, meta]) => (
            <SelectItem key={key} value={key} className="text-xs">
              {translateMetaLabel(t, meta)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetFilters}>
          <X className="h-3.5 w-3.5 mr-1" />
          {t('deploy.filters.clear', 'Zurücksetzen')}
        </Button>
      )}
    </div>
  );
}
