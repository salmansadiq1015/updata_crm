'use client';

import { useState, useCallback, useRef } from 'react';
import { useSchedulingStore } from '../stores/scheduling-store';
import { conflictService } from '../services/conflict-service';
import { useAssignmentMutations } from './use-assignment-mutations';
import { useUndoAction } from './use-undo-action';

export function useDragAssignment() {
  const { setDragState, clearDragState, setConflictPreview, conflictPreview } = useSchedulingStore();
  const { move } = useAssignmentMutations({});
  const { registerUndo } = useUndoAction();
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const pendingMoveRef = useRef(null);
  const debounceRef = useRef(null);

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
    const { over } = event;
    if (!over?.data?.current) return;

    const { employeeId, startDatetime, endDatetime } = over.data.current;
    if (!employeeId || !startDatetime || !endDatetime) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await conflictService.checkConflicts({
          employeeId,
          startDatetime,
          endDatetime,
          excludeAssignmentId: event.active?.data?.current?.assignment?._id,
        });
        setConflictPreview(result);
      } catch {
        setConflictPreview(null);
      }
    }, 200);
  }, [setConflictPreview]);

  const handleDragEnd = useCallback((event) => {
    clearTimeout(debounceRef.current);
    const { active, over } = event;

    if (!over?.data?.current) {
      clearDragState();
      return;
    }

    const assignment = active.data.current?.assignment;
    const { employeeId, startDatetime, endDatetime } = over.data.current;

    if (!assignment || !employeeId || !startDatetime || !endDatetime) {
      clearDragState();
      return;
    }

    const hasHardConflict = conflictPreview?.conflicts?.some((c) => c.severity === 'HARD');

    if (hasHardConflict) {
      pendingMoveRef.current = {
        assignmentId: assignment._id,
        newEmployeeId: employeeId,
        newStartDatetime: startDatetime,
        newEndDatetime: endDatetime,
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
        newEmployeeId: employeeId,
        newStartDatetime: startDatetime,
        newEndDatetime: endDatetime,
        overrideConflicts: !hasHardConflict,
      },
    });

    clearDragState();
  }, [conflictPreview, clearDragState, move, registerUndo]);

  const handleConflictOverride = useCallback((overrideReason) => {
    const pending = pendingMoveRef.current;
    if (!pending) return;

    registerUndo({
      action: 'move',
      previousState: pending.previousState,
    });

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

    pendingMoveRef.current = null;
    setShowConflictDialog(false);
  }, [move, registerUndo]);

  const handleConflictCancel = useCallback(() => {
    pendingMoveRef.current = null;
    setShowConflictDialog(false);
  }, []);

  return {
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    showConflictDialog,
    conflictPreview,
    handleConflictOverride,
    handleConflictCancel,
  };
}
