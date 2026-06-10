'use client';

import { useState, useCallback, useRef } from 'react';
import { useSchedulingStore } from '../stores/scheduling-store';
import { conflictService } from '../services/conflict-service';
import { useAssignmentMutations } from './use-assignment-mutations';
import { useUndoAction } from './use-undo-action';
import { CALENDAR_VIEWS, DAY_END_HOUR, DAY_START_HOUR } from '../constants/deploy-constants';

const SNAP_MINUTES = 15;

function buildRequirements(assignment) {
  return {
    requiredSkills: assignment?.requiredSkills || [],
    recommendedSkills: assignment?.recommendedSkills || [],
    requiredCertifications: assignment?.requiredCertifications || [],
    recommendedCertifications: assignment?.recommendedCertifications || [],
  };
}

function snapDate(date) {
  const snapped = new Date(date);
  const minutes = snapped.getMinutes();
  const snappedMinutes = Math.max(0, Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
  snapped.setMinutes(snappedMinutes, 0, 0);
  return snapped;
}

export function useDragAssignment({ view = CALENDAR_VIEWS.WEEK, days = [] } = {}) {
  const { setDragState, clearDragState, setConflictPreview, conflictPreview } = useSchedulingStore();
  const { move, resize } = useAssignmentMutations({});
  const { registerUndo } = useUndoAction();
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const pendingActionRef = useRef(null);
  const debounceRef = useRef(null);

  const buildMoveTarget = useCallback((assignment, dropData) => {
    if (!assignment || !dropData?.employeeId || !dropData?.startDatetime) return null;

    const start = new Date(dropData.startDatetime);
    const originalStart = new Date(assignment.startDatetime);
    const originalEnd = new Date(assignment.endDatetime);
    const durationMs = Math.max(15 * 60 * 1000, originalEnd.getTime() - originalStart.getTime());
    const end = dropData.endDatetime
      ? new Date(dropData.endDatetime)
      : new Date(start.getTime() + durationMs);

    return {
      employeeId: dropData.employeeId,
      startDatetime: start.toISOString(),
      endDatetime: end.toISOString(),
    };
  }, []);

  const checkConflicts = useCallback((assignment, target) => conflictService.checkConflicts({
    employeeId: target.employeeId,
    startDatetime: target.startDatetime,
    endDatetime: target.endDatetime,
    excludeAssignmentId: assignment?._id,
    ...buildRequirements(assignment),
  }), []);

  const handleDragStart = useCallback((event) => {
    const { active } = event;
    const assignment = active.data.current?.assignment;
    if (!assignment) return;

    setDragState({
      assignmentId: assignment._id,
      originalEmployee: assignment.employeeId,
      originalStart: assignment.startDatetime,
      originalEnd: assignment.endDatetime,
    });
  }, [setDragState]);

  const handleDragOver = useCallback((event) => {
    const { active, over } = event;
    if (!over?.data?.current) return;

    const assignment = active.data.current?.assignment;
    const target = buildMoveTarget(assignment, over.data.current);
    if (!target) return;

    setConflictPreview(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkConflicts(assignment, target);
        setConflictPreview(result);
      } catch {
        setConflictPreview(null);
      }
    }, 200);
  }, [buildMoveTarget, checkConflicts, setConflictPreview]);

  const handleDragEnd = useCallback(async (event) => {
    clearTimeout(debounceRef.current);
    const { active, over } = event;

    if (!over?.data?.current) {
      clearDragState();
      return;
    }

    const assignment = active.data.current?.assignment;
    const target = buildMoveTarget(assignment, over.data.current);

    if (!assignment || !target) {
      clearDragState();
      return;
    }

    let conflicts = [];
    try {
      const result = await checkConflicts(assignment, target);
      conflicts = result?.conflicts || [];
      setConflictPreview(result);
    } catch {
      conflicts = [];
      setConflictPreview(null);
    }

    if (conflicts.length > 0) {
      pendingActionRef.current = {
        type: 'move',
        assignmentId: assignment._id,
        newEmployeeId: target.employeeId,
        newStartDatetime: target.startDatetime,
        newEndDatetime: target.endDatetime,
        previousState: {
          assignmentId: assignment._id,
          employeeId: assignment.employeeId?._id || assignment.employeeId,
          startDatetime: assignment.startDatetime,
          endDatetime: assignment.endDatetime,
        },
      };
      setShowConflictDialog(true);
      clearDragState();
      return;
    }

    registerUndo({
      action: 'move',
      previousState: {
        assignmentId: assignment._id,
        employeeId: assignment.employeeId?._id || assignment.employeeId,
        startDatetime: assignment.startDatetime,
        endDatetime: assignment.endDatetime,
      },
    });

    move.mutate({
      id: assignment._id,
      data: {
        newEmployeeId: target.employeeId,
        newStartDatetime: target.startDatetime,
        newEndDatetime: target.endDatetime,
        overrideConflicts: false,
      },
    });

    clearDragState();
  }, [buildMoveTarget, checkConflicts, clearDragState, move, registerUndo, setConflictPreview]);

  const handleResizeStart = useCallback((assignment, event) => {
    if (!assignment || !event?.currentTarget) return;

    const row = event.currentTarget.closest('[data-calendar-row-grid="true"]');
    if (!row) return;

    event.preventDefault();
    const startX = event.clientX;
    const rowWidth = row.getBoundingClientRect().width || 1;
    const originalStart = new Date(assignment.startDatetime);
    const originalEnd = new Date(assignment.endDatetime);
    const employeeId = assignment.employeeId?._id || assignment.employeeId;

    const handleMouseUp = async (mouseEvent) => {
      window.removeEventListener('mouseup', handleMouseUp);

      const deltaX = mouseEvent.clientX - startX;
      const visibleMinutes = view === CALENDAR_VIEWS.MONTH
        ? days.length * 24 * 60
        : days.length * (DAY_END_HOUR - DAY_START_HOUR) * 60;
      const deltaMinutes = Math.round((deltaX / rowWidth) * visibleMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const minEnd = new Date(originalStart.getTime() + SNAP_MINUTES * 60 * 1000);
      const targetEnd = snapDate(new Date(originalEnd.getTime() + deltaMinutes * 60 * 1000));
      const newEnd = targetEnd > minEnd ? targetEnd : minEnd;

      if (newEnd.getTime() === originalEnd.getTime()) return;

      const target = {
        employeeId,
        startDatetime: originalStart.toISOString(),
        endDatetime: newEnd.toISOString(),
      };

      let conflicts = [];
      try {
        const result = await checkConflicts(assignment, target);
        conflicts = result?.conflicts || [];
        setConflictPreview(result);
      } catch {
        conflicts = [];
        setConflictPreview(null);
      }

      const previousState = {
        assignmentId: assignment._id,
        employeeId,
        startDatetime: assignment.startDatetime,
        endDatetime: assignment.endDatetime,
      };

      if (conflicts.length > 0) {
        pendingActionRef.current = {
          type: 'resize',
          assignmentId: assignment._id,
          newEndDatetime: newEnd.toISOString(),
          previousState,
        };
        setShowConflictDialog(true);
        return;
      }

      registerUndo({ action: 'resize', previousState });
      resize.mutate({
        id: assignment._id,
        data: {
          newEndDatetime: newEnd.toISOString(),
          overrideConflicts: false,
        },
      });
      setConflictPreview(null);
    };

    window.addEventListener('mouseup', handleMouseUp);
  }, [checkConflicts, days.length, registerUndo, resize, setConflictPreview, view]);

  const handleConflictOverride = useCallback((overrideReason) => {
    const pending = pendingActionRef.current;
    if (!pending) return;

    const hasHardConflict = conflictPreview?.conflicts?.some((conflict) => conflict.severity === 'HARD');
    if (hasHardConflict) return;

    registerUndo({
      action: pending.type === 'resize' ? 'resize' : 'move',
      previousState: pending.previousState,
    });

    if (pending.type === 'resize') {
      resize.mutate({
        id: pending.assignmentId,
        data: {
          newEndDatetime: pending.newEndDatetime,
          overrideConflicts: true,
          overrideReason,
        },
      });
    } else {
      move.mutate({
        id: pending.assignmentId,
        data: {
          newEmployeeId: pending.newEmployeeId,
          newStartDatetime: pending.newStartDatetime,
          newEndDatetime: pending.newEndDatetime,
          overrideConflicts: true,
          overrideReason,
        },
      });
    }

    pendingActionRef.current = null;
    setShowConflictDialog(false);
    setConflictPreview(null);
  }, [conflictPreview, move, registerUndo, resize, setConflictPreview]);

  const handleConflictCancel = useCallback(() => {
    pendingActionRef.current = null;
    setShowConflictDialog(false);
    setConflictPreview(null);
    clearDragState();
  }, [clearDragState, setConflictPreview]);

  const handleDragCancel = useCallback(() => {
    clearTimeout(debounceRef.current);
    pendingActionRef.current = null;
    setShowConflictDialog(false);
    setConflictPreview(null);
    clearDragState();
  }, [clearDragState, setConflictPreview]);

  return {
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    handleResizeStart,
    showConflictDialog,
    conflictPreview,
    handleConflictOverride,
    handleConflictCancel,
  };
}
