'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// Drag-to-fill for the coarse matrix. The user presses on a cell that holds a
// single allocation and drags horizontally across that row's weeks; on release
// the same employee+project is replicated at the source percentage across every
// dragged week via a bulk upsert. A plain click (no horizontal movement) is left
// to the normal cycle handler — we only swallow the trailing click when an actual
// multi-week drag committed.
export function useCoarseDragFill({ year, onCommit }) {
  const [drag, setDrag] = useState(null);
  const suppressClickRef = useRef(false);

  const start = useCallback((rowId, week, allocations) => {
    const list = Array.isArray(allocations) ? allocations : [allocations].filter(Boolean);
    if (list.length !== 1) return; // only single-allocation cells seed a fill
    const source = list[0];
    setDrag({
      rowId,
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

  const isInRange = useCallback((rowId, week) => {
    if (!drag || drag.rowId !== rowId) return false;
    const from = Math.min(drag.anchor, drag.hover);
    const to = Math.max(drag.anchor, drag.hover);
    return week >= from && week <= to;
  }, [drag]);

  const consumeClickSuppression = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!drag) return undefined;
    const handleUp = () => {
      setDrag((current) => {
        if (!current) return null;
        const from = Math.min(current.anchor, current.hover);
        const to = Math.max(current.anchor, current.hover);
        if (to > from) {
          const allocations = [];
          for (let week = from; week <= to; week += 1) {
            allocations.push({
              employeeId: current.employeeId,
              projectId: current.projectId,
              calendarYear: year,
              calendarWeek: week,
              allocationPercent: current.percent,
            });
          }
          onCommit(allocations);
          suppressClickRef.current = true; // swallow the click that follows mouseup
        }
        return null;
      });
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [drag, year, onCommit]);

  return {
    start,
    extend,
    isInRange,
    consumeClickSuppression,
    isDragging: !!drag,
    dragPercent: drag?.percent ?? null,
  };
}
