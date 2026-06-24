'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { projectService } from '@/modules/pm/services/project-service';
import { useCoarseMatrix, useCoarseMutations } from '../../hooks/use-coarse-mutations';
import { useCoarseDragFill } from '../../hooks/use-coarse-drag-fill';
import { useDeployEmployees } from '../../hooks/use-deploy-employees';
import { CoarseHeader } from './coarse-header';
import { CoarseSummary } from './coarse-summary';
import { CoarseGrid } from './coarse-grid';
import { CoarseBulkDialog } from './coarse-bulk-dialog';
import { CoarseCreateDialog } from './coarse-create-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { Skeleton as BoneSkeleton } from 'boneyard-js/react';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { columnAverages, computeKpis, isRowOverAllocated } from '../../utils/coarse-totals';
import { Grid3X3 } from 'lucide-react';
import { getISOWeek } from 'date-fns';

const VISIBLE_WEEKS = 12;
const ROW_SOURCE_LIMIT = 80;
const PROJECT_ROW_PARAMS = Object.freeze({
  limit: ROW_SOURCE_LIMIT,
  sortBy: 'projectNumber',
  sortOrder: 'desc',
});

function normalizeProjectList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function getProjectId(project) {
  return project?._id || project?.id || '';
}

function getProjectName(project) {
  return [project?.projectNumber, project?.name].filter(Boolean).join(' - ') || getProjectId(project);
}

function getEmployeeId(employee) {
  return employee?._id || employee?.id || '';
}

function getEmployeeName(employee) {
  return employee?.fullName || [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || getEmployeeId(employee);
}

export function CoarseMatrix() {
  const { t } = useLanguage();
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowWeek = getISOWeek(now);

  const [year, setYear] = useState(nowYear);
  const [weekFrom, setWeekFrom] = useState(nowWeek);
  const [weekTo, setWeekTo] = useState(Math.min(53, nowWeek + VISIBLE_WEEKS - 1));
  const [viewMode, setViewMode] = useState('EMPLOYEE_CENTRIC');
  const [search, setSearch] = useState('');
  const [overAllocatedOnly, setOverAllocatedOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEmployeeId, setBulkEmployeeId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState({ employeeId: '', projectId: '', week: nowWeek });

  const params = useMemo(() => ({ year, weekFrom, weekTo, view: viewMode }), [year, weekFrom, weekTo, viewMode]);

  const { data: matrixData, isLoading } = useCoarseMatrix(params);
  const { update, remove, bulkUpsert } = useCoarseMutations();
  const isProjectView = viewMode === 'PROJECT_CENTRIC';

  const { data: employees = [], isLoading: employeesLoading } = useDeployEmployees({
    enabled: !isProjectView,
    limit: ROW_SOURCE_LIMIT,
  });

  const { data: projectRowsResponse, isLoading: projectsLoading } = useQuery({
    queryKey: queryKeys.pm.projects.list(PROJECT_ROW_PARAMS),
    queryFn: () => projectService.getProjects(PROJECT_ROW_PARAMS),
    enabled: isProjectView,
    staleTime: 60_000,
  });

  const projectRows = useMemo(
    () => normalizeProjectList(projectRowsResponse),
    [projectRowsResponse],
  );

  const allocations = useMemo(() => {
    const raw = Array.isArray(matrixData) ? matrixData : matrixData?.data || [];
    return raw;
  }, [matrixData]);

  const weeks = useMemo(() => {
    const arr = [];
    for (let w = weekFrom; w <= weekTo; w++) arr.push(w);
    return arr;
  }, [weekFrom, weekTo]);

  const currentWeek = year === nowYear ? nowWeek : null;

  const allRows = useMemo(() => {
    const map = new Map();
    const ensureRow = (id, name) => {
      if (!id) return null;
      if (!map.has(id)) map.set(id, { id, name: name || id, weekMap: {} });
      return map.get(id);
    };

    if (isProjectView) {
      projectRows.forEach((project) => ensureRow(getProjectId(project), getProjectName(project)));
    } else {
      employees.forEach((employee) => ensureRow(getEmployeeId(employee), getEmployeeName(employee)));
    }

    allocations.forEach((a) => {
      const id = isProjectView ? (a.projectId?._id || a.projectId) : (a.employeeId?._id || a.employeeId);
      const name = isProjectView
        ? (a.projectId?.name || a.projectId)
        : (a.employeeId?.firstName ? `${a.employeeId.firstName} ${a.employeeId.lastName}` : a.employeeId);
      const entry = ensureRow(id, name);
      if (!entry) return;
      if (!entry.weekMap[a.calendarWeek]) entry.weekMap[a.calendarWeek] = [];
      entry.weekMap[a.calendarWeek].push(a);
    });
    return Array.from(map.values());
  }, [allocations, employees, isProjectView, projectRows]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (term && !String(row.name || '').toLowerCase().includes(term)) return false;
      if (overAllocatedOnly && !isRowOverAllocated(row, weeks)) return false;
      return true;
    });
  }, [allRows, search, overAllocatedOnly, weeks]);

  const columnAvgs = useMemo(() => columnAverages(rows, weeks), [rows, weeks]);
  const kpis = useMemo(() => computeKpis(allRows, weeks), [allRows, weeks]);

  const dragFill = useCoarseDragFill({
    year,
    onCommit: (alloc) => bulkUpsert.mutate({ allocations: alloc }),
  });

  const handlePrevRange = useCallback(() => {
    const newFrom = weekFrom - VISIBLE_WEEKS;
    if (newFrom < 1) {
      setYear((y) => y - 1);
      setWeekFrom(53 + newFrom);
      setWeekTo(53);
    } else {
      setWeekFrom(newFrom);
      setWeekTo(weekFrom - 1);
    }
  }, [weekFrom]);

  const handleNextRange = useCallback(() => {
    const newTo = weekTo + VISIBLE_WEEKS;
    if (newTo > 53) {
      setYear((y) => y + 1);
      setWeekFrom(1);
      setWeekTo(VISIBLE_WEEKS);
    } else {
      setWeekFrom(weekTo + 1);
      setWeekTo(newTo);
    }
  }, [weekTo]);

  const handleCellClick = useCallback((rowId, week, existing) => {
    const list = Array.isArray(existing) ? existing : [existing].filter(Boolean);
    if (list.length === 1) {
      const current = list[0];
      const nextMap = { 25: 50, 50: 75, 75: 100 };
      const nextPercent = nextMap[current.allocationPercent];
      if (nextPercent) {
        update.mutate({ id: current._id, data: { allocationPercent: nextPercent } });
      } else {
        remove.mutate(current._id);
      }
      return;
    }
    if (list.length > 1) return;

    setCreateDefaults(viewMode === 'PROJECT_CENTRIC'
      ? { employeeId: '', projectId: rowId, week }
      : { employeeId: rowId, projectId: '', week });
    setCreateOpen(true);
  }, [remove, update, viewMode]);

  const handleSetPercent = useCallback((existing, percent) => {
    const list = Array.isArray(existing) ? existing : [existing].filter(Boolean);
    if (list.length === 1) {
      update.mutate({ id: list[0]._id, data: { allocationPercent: percent } });
    }
  }, [update]);

  const handleClear = useCallback((existing) => {
    const list = Array.isArray(existing) ? existing : [existing].filter(Boolean);
    if (list.length === 1) remove.mutate(list[0]._id);
  }, [remove]);

  const openBulk = useCallback((employeeId) => {
    setBulkEmployeeId(employeeId);
    setBulkOpen(true);
  }, []);

  const hasFilters = !!search.trim() || overAllocatedOnly;

  return (
    <div className="space-y-4 p-4">
      <CoarseHeader
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
        viewMode={viewMode}
        search={search}
        overAllocatedOnly={overAllocatedOnly}
        onSearchChange={setSearch}
        onOverAllocatedOnlyChange={setOverAllocatedOnly}
        onYearChange={setYear}
        onWeekFromChange={setWeekFrom}
        onWeekToChange={setWeekTo}
        onViewModeChange={setViewMode}
        onPrevRange={handlePrevRange}
        onNextRange={handleNextRange}
      />

      <CoarseSummary kpis={kpis} viewMode={viewMode} weekCount={weeks.length} />

      <BoneSkeleton name="deploy-coarse-matrix" loading={isLoading || employeesLoading || projectsLoading}>
        {allRows.length === 0 ? (
          <DeployEmptyState
            icon={Grid3X3}
            title={t('deploy.empty.coarseTitle', 'Keine Zuteilungen')}
            description={t('deploy.empty.coarseDesc', 'Weisen Sie Mitarbeitern Projekte zu, um die Grobplanung zu starten.')}
            actionLabel={t('deploy.coarse.createAllocation', 'Zuteilung erstellen')}
            onAction={() => {
              setCreateDefaults({ employeeId: '', projectId: '', week: weekFrom });
              setCreateOpen(true);
            }}
            compact
          />
        ) : rows.length === 0 ? (
          <DeployEmptyState
            icon={Grid3X3}
            title={t('deploy.coarse.noMatches', 'Keine Treffer')}
            description={hasFilters
              ? t('deploy.coarse.noMatchesDesc', 'Keine Zeilen entsprechen den aktuellen Filtern.')
              : t('deploy.empty.coarseDesc', 'Weisen Sie Mitarbeitern Projekte zu, um die Grobplanung zu starten.')}
            actionLabel={t('deploy.coarse.clearFilters', 'Filter zuruecksetzen')}
            onAction={() => { setSearch(''); setOverAllocatedOnly(false); }}
            compact
          />
        ) : (
          <CoarseGrid
            viewMode={viewMode}
            weeks={weeks}
            rows={rows}
            columnAvgs={columnAvgs}
            currentWeek={currentWeek}
            dragFill={dragFill}
            onCellClick={handleCellClick}
            onSetPercent={handleSetPercent}
            onClear={handleClear}
            onBulkRow={openBulk}
          />
        )}
      </BoneSkeleton>

      <CoarseBulkDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        employeeId={bulkEmployeeId}
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
      />
      <CoarseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultEmployeeId={createDefaults.employeeId}
        defaultProjectId={createDefaults.projectId}
        defaultWeek={createDefaults.week}
        year={year}
      />
    </div>
  );
}
