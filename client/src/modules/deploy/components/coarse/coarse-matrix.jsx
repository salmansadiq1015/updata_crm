'use client';

import { useState, useMemo, useCallback } from 'react';
import { useCoarseMatrix, useCoarseMutations } from '../../hooks/use-coarse-mutations';
import { CoarseHeader } from './coarse-header';
import { CoarseCell } from './coarse-cell';
import { CoarseLegend } from './coarse-legend';
import { CoarseBulkDialog } from './coarse-bulk-dialog';
import { CoarseCreateDialog } from './coarse-create-dialog';
import { EmployeeAvatarRow } from '../shared/employee-avatar-row';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { Skeleton as BoneSkeleton } from 'boneyard-js/react';
import { DeployEmptyState } from '../shared/deploy-empty-state';
import { Layers, Grid3X3 } from 'lucide-react';
import { getISOWeek } from 'date-fns';

const VISIBLE_WEEKS = 12;

export function CoarseMatrix() {
  const { t } = useLanguage();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [weekFrom, setWeekFrom] = useState(getISOWeek(now));
  const [weekTo, setWeekTo] = useState(Math.min(53, getISOWeek(now) + VISIBLE_WEEKS - 1));
  const [viewMode, setViewMode] = useState('EMPLOYEE_CENTRIC');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkEmployeeId, setBulkEmployeeId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState({ employeeId: '', projectId: '', week: getISOWeek(now) });

  const params = useMemo(() => ({
    year, weekFrom, weekTo, view: viewMode,
  }), [year, weekFrom, weekTo, viewMode]);

  const { data: matrixData, isLoading } = useCoarseMatrix(params);
  const { update, remove } = useCoarseMutations();

  const allocations = useMemo(() => {
    const raw = Array.isArray(matrixData) ? matrixData : matrixData?.data || [];
    return raw;
  }, [matrixData]);

  const weeks = useMemo(() => {
    const arr = [];
    for (let w = weekFrom; w <= weekTo; w++) arr.push(w);
    return arr;
  }, [weekFrom, weekTo]);

  const groupedRows = useMemo(() => {
    const map = new Map();
    if (viewMode === 'PROJECT_CENTRIC') {
      allocations.forEach((a) => {
        const projId = a.projectId?._id || a.projectId;
        const projName = a.projectId?.name || projId;
        if (!map.has(projId)) map.set(projId, { id: projId, name: projName, weekMap: {} });
        const entry = map.get(projId);
        if (!entry.weekMap[a.calendarWeek]) entry.weekMap[a.calendarWeek] = [];
        entry.weekMap[a.calendarWeek].push(a);
      });
    } else {
      allocations.forEach((a) => {
        const empId = a.employeeId?._id || a.employeeId;
        const empName = a.employeeId?.firstName
          ? `${a.employeeId.firstName} ${a.employeeId.lastName}`
          : empId;
        if (!map.has(empId)) map.set(empId, { id: empId, name: empName, weekMap: {} });
        const entry = map.get(empId);
        if (!entry.weekMap[a.calendarWeek]) entry.weekMap[a.calendarWeek] = [];
        entry.weekMap[a.calendarWeek].push(a);
      });
    }
    return Array.from(map.values());
  }, [allocations, viewMode]);

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
  }, [setWeekFrom, setWeekTo, setYear, weekFrom]);

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
  }, [setWeekFrom, setWeekTo, setYear, weekTo]);

  const handleCellClick = useCallback((rowId, week, existing) => {
    const existingAllocations = Array.isArray(existing) ? existing : [existing].filter(Boolean);
    if (existingAllocations.length === 1) {
      const current = existingAllocations[0];
      const nextMap = { 25: 50, 50: 75, 75: 100 };
      const nextPercent = nextMap[current.allocationPercent];
      if (nextPercent) {
        update.mutate({
          id: current._id,
          data: { allocationPercent: nextPercent },
        });
      } else {
        remove.mutate(current._id);
      }
      return;
    }

    if (existingAllocations.length > 1) return;

    setCreateDefaults(viewMode === 'PROJECT_CENTRIC'
      ? { employeeId: '', projectId: rowId, week }
      : { employeeId: rowId, projectId: '', week });
    setCreateOpen(true);
  }, [remove, setCreateDefaults, setCreateOpen, update, viewMode]);

  return (
    <div className="p-4 space-y-3">
      <CoarseHeader
        year={year}
        weekFrom={weekFrom}
        weekTo={weekTo}
        viewMode={viewMode}
        onYearChange={setYear}
        onWeekFromChange={setWeekFrom}
        onWeekToChange={setWeekTo}
        onViewModeChange={setViewMode}
        onPrevRange={handlePrevRange}
        onNextRange={handleNextRange}
      />

      <CoarseLegend />

      <BoneSkeleton name="deploy-coarse-matrix" loading={isLoading}>
        <div className="border rounded-lg overflow-auto bg-background">
          {/* Header row */}
          <div className="flex sticky top-0 z-10 bg-muted/30 border-b">
            <div className="w-[200px] shrink-0 px-3 py-2 text-xs font-semibold border-r sticky left-0 bg-muted/30">
              {viewMode === 'PROJECT_CENTRIC' ? t('deploy.coarse.project', 'Projekt') : t('deploy.coarse.employee', 'Mitarbeiter')}
            </div>
            {weeks.map((w) => (
              <div key={w} className="min-w-[60px] flex-1 text-center py-2 text-xs font-medium border-r last:border-r-0">
                KW {w}
              </div>
            ))}
          </div>

          {/* Employee rows */}
          {groupedRows.length === 0 ? (
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
          ) : (
            groupedRows.map((row) => (
              <div key={row.id} className="flex border-b last:border-b-0 hover:bg-muted/10 group">
                <div className="w-[200px] shrink-0 px-3 py-2 border-r flex items-center justify-between sticky left-0 bg-background">
                  <div className="min-w-0">
                    {viewMode === 'PROJECT_CENTRIC'
                      ? <span className="text-xs font-medium truncate">{row.name}</span>
                      : <EmployeeAvatarRow name={row.name} />}
                  </div>
                  {viewMode === 'EMPLOYEE_CENTRIC' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => { setBulkEmployeeId(row.id); setBulkOpen(true); }}
                    >
                      <Layers className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {weeks.map((w) => {
                  const alloc = row.weekMap[w] || [];
                  return (
                    <div key={w} className="min-w-[60px] flex-1">
                      <CoarseCell
                        allocation={alloc}
                        projectName={viewMode === 'PROJECT_CENTRIC' ? row.name : undefined}
                        onClick={() => handleCellClick(row.id, w, alloc)}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
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
