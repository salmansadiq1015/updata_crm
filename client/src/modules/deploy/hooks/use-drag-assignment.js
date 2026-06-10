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

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await conflictService.checkConflicts({
          employeeId: target.employeeId,
          startDatetime: target.startDatetime,
          endDatetime: target.endDatetime,
          excludeAssignmentId: assignment?._id,
        });
        setConflictPreview(result);
      } catch {
        setConflictPreview(null);
      }
    }, 200);
  }, [buildMoveTarget, setConflictPreview]);

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
      const result = await conflictService.checkConflicts({
        employeeId: target.employeeId,
        startDatetime: target.startDatetime,
        endDatetime: target.endDatetime,
        excludeAssignmentId: assignment._id,
      });
      conflicts = result?.conflicts || [];
      setConflictPreview(result);
    } catch {
      conflicts = [];
      setConflictPreview(null);
    }

    if (conflicts.length > 0) {
      pendingMoveRef.current = {
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
  }, [buildMoveTarget, clearDragState, move, registerUndo, setConflictPreview]);

  const handleConflictOverride = useCallback((overrideReason) => {
    const pending = pendingMoveRef.current;
    if (!pending) return;

    const hasHardConflict = conflictPreview?.conflicts?.some((conflict) => conflict.severity === 'HARD');
    if (hasHardConflict) return;

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
    setConflictPreview(null);
  }, [conflictPreview, move, registerUndo, setConflictPreview]);

  const handleConflictCancel = useCallback(() => {
    pendingMoveRef.current = null;
    setShowConflictDialog(false);
    setConflictPreview(null);
    clearDragState();
  }, [clearDragState, setConflictPreview]);

  const handleDragCancel = useCallback(() => {
    clearTimeout(debounceRef.current);
    pendingMoveRef.current = null;
    setShowConflictDialog(false);
    setConflictPreview(null);
    clearDragState();
  }, [clearDragState, setConflictPreview]);

  return {
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    showConflictDialog,
    conflictPreview,
    handleConflictOverride,
    handleConflictCancel,
  };
}
