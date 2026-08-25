'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CalendarHeader } from './calendar-header';
import { CalendarGrid } from './calendar-grid';
import { CalendarPrintView } from './calendar-print-view';
import { CalendarMobileList } from './calendar-mobile-list';
import { AssignmentForm } from '../assignment/assignment-form';
import { AssignmentDetailDrawer } from '../assignment/assignment-detail-drawer';
import { ConflictDialog } from '../conflict/conflict-dialog';
import { useDragAssignment } from '../../hooks/use-drag-assignment';
import { useCalendarNavigation } from '../../hooks/use-calendar-navigation';
import { useCalendarQuery } from '../../hooks/use-calendar-query';
import { usePrefetchAdjacentRanges } from '../../hooks/use-prefetch-adjacent';
import { useCalendarKeyboard } from '../../hooks/use-calendar-keyboard';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useMediaQuery } from '@/shared/hooks/use-media-query';

export function CalendarView({ focusId = null }) {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('scheduling:write');

  const {
    view, setView, currentDate, title, days, timeSlots,
    goToday, goNext, goPrev, queryParams,
  } = useCalendarNavigation();

  const { data: calendarData, isLoading } = useCalendarQuery(queryParams);

  const isMobile = useMediaQuery('(max-width: 768px)');

  usePrefetchAdjacentRanges(view, currentDate);
  useCalendarKeyboard({ goNext, goPrev, goToday, setView });

  const employees = useMemo(() => {
    if (!calendarData) return [];
    const data = Array.isArray(calendarData) ? calendarData : calendarData.data || [];
    return data;
  }, [calendarData]);

  // DnD
  const {
    handleDragStart, handleDragOver, handleDragEnd, handleDragCancel,
    handleResizeStart,
    showConflictDialog, conflictPreview,
    handleConflictOverride, handleConflictCancel,
  } = useDragAssignment({ view, days });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaults, setFormDefaults] = useState(null);
  const [formPrefill, setFormPrefill] = useState(null);

  // Detail drawer state
  const [drawerAssignmentId, setDrawerAssignmentId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Deep link from the AI assistant: open the Einsatz it named, once. The
  // drawer loads by id, so it does not matter whether the calendar happens to
  // be showing the week that assignment falls in.
  const focusedRef = useRef(null);
  useEffect(() => {
    if (!focusId || focusedRef.current === focusId) return;
    focusedRef.current = focusId;
    setDrawerAssignmentId(focusId);
    setDrawerOpen(true);
  }, [focusId]);

  const handleAssignmentClick = useCallback((assignment) => {
    setDrawerAssignmentId(assignment._id);
    setDrawerOpen(true);
  }, []);

  const handleNewAssignment = useCallback(() => {
    setFormDefaults(null);
    setFormPrefill(null);
    setFormOpen(true);
  }, []);

  const handleSlotClick = useCallback((slot) => {
    setFormDefaults(null);
    setFormPrefill({
      employeeIds: [slot.employeeId],
      startDatetime: slot.startDatetime,
      endDatetime: slot.endDatetime,
    });
    setFormOpen(true);
  }, []);

  const handleEditFromDrawer = useCallback((assignment) => {
    setDrawerOpen(false);
    setFormDefaults(assignment);
    setFormPrefill(null);
    setFormOpen(true);
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col h-full p-4 print:p-0">
        <div className="print:hidden">
          <CalendarHeader
            title={title}
            view={view}
            onViewChange={setView}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onNewAssignment={canWrite ? handleNewAssignment : undefined}
            onPrint={handlePrint}
          />
        </div>

        {isMobile ? (
          <CalendarMobileList
            employees={employees}
            onAssignmentClick={handleAssignmentClick}
          />
        ) : (
          <CalendarGrid
            employees={employees}
            days={days}
            timeSlots={timeSlots}
            view={view}
            isLoading={isLoading}
            canWrite={canWrite}
            onAssignmentClick={handleAssignmentClick}
            onResizeStart={handleResizeStart}
            onSlotClick={canWrite ? handleSlotClick : undefined}
            onNewAssignment={canWrite ? handleNewAssignment : undefined}
          />
        )}
      </div>

      {/* Assignment create/edit dialog */}
      <AssignmentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={formDefaults}
        prefill={formPrefill}
      />

      {/* Assignment detail drawer */}
      <AssignmentDetailDrawer
        assignmentId={drawerAssignmentId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onEdit={handleEditFromDrawer}
      />

      {/* Conflict override dialog */}
      <ConflictDialog
        open={showConflictDialog}
        conflicts={conflictPreview?.conflicts || []}
        onOverride={handleConflictOverride}
        onCancel={handleConflictCancel}
      />

      {/* Print-only tabular layout */}
      <CalendarPrintView employees={employees} days={days} title={title} />
    </DndContext>
  );
}
