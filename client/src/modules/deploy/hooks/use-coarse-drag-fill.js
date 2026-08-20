'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// Drag-to-move for the coarse matrix. The user presses on a cell that holds a
// single allocation and drags horizontally to another week in the same row; on
// release the allocation is moved to the target week via the move endpoint.
// A plain click (no horizontal movement) is left to the normal click handler —
// we only swallow the trailing click when an actual move committed.
export function useCoarseDragFill({ year, onMove }) {
  const [drag, setDrag] = useState(null);
  const suppressClickRef = useRef(false);

  const start = useCallback((rowId, week, allocations) => {
    const list = Array.isArray(allocations) ? allocations : [allocations].filter(Boolean);
    if (list.length !== 1) return; // only single-allocation cells seed a drag
    const source = list[0];
    setDrag({
      rowId,
      allocationId: source._id,
      employeeId: source.employeeId?._id || source.employeeId,
      projectId: source.projectId?._id || source.projectId,
      percent: source.allocationPercent,
      anchor: week,
      hover: week,
    });
  }, []);

  const extend = useCallback((rowId, week) => {
    setDrag((current) => (current && current.rowId === rowId ? { ...current, hover: week } : current));
  }, []);

  // Only highlight the current hover cell as a drop target (not a range).
  const isDropTarget = useCallback((rowId, week) => {
    if (!drag || drag.rowId !== rowId) return false;
    return week === drag.hover && week !== drag.anchor;
  }, [drag]);

  // Mark the source cell during drag.
  const isSource = useCallback((rowId, week) => {
    if (!drag || drag.rowId !== rowId) return false;
    return week === drag.anchor;
  }, [drag]);

  const consumeClickSuppression = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  // Keep a ref so the mouseup handler always sees the latest drag state
  // without needing `drag` in its dependency array (which would re-register
  // the listener on every hover-extend).
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!drag) return undefined;
    const handleUp = () => {
      const current = dragRef.current;
      if (!current) { setDrag(null); return; }
      // Clear state first, then fire the side-effect OUTSIDE the state
      // updater so React strict-mode double-invocation doesn't duplicate it.
      setDrag(null);
      if (current.hover !== current.anchor) {
        onMoveRef.current(current.allocationId, year, current.hover);
        suppressClickRef.current = true; // swallow the click that follows mouseup
      }
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [drag, year]);

  return {
    start,
    extend,
    isDropTarget,
    isSource,
    consumeClickSuppression,
    isDragging: !!drag,
    dragPercent: drag?.percent ?? null,
  };
}
