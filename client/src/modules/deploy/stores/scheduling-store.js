import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CALENDAR_VIEWS } from '../constants/deploy-constants';

export const useSchedulingStore = create(
  persist(
    (set, get) => ({
      view: CALENDAR_VIEWS.WEEK,
      currentDate: new Date().toISOString(),
      filters: {
        teamId: null,
        employeeIds: [],
        assignmentType: null,
        status: null,
      },
      isTeamGrouped: false,

      dragState: null,
      conflictPreview: null,
      undoStack: [],

      setView: (view) => set({ view }),
      setCurrentDate: (date) => set({ currentDate: typeof date === 'string' ? date : date.toISOString() }),
      setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
      resetFilters: () => set({
        filters: { teamId: null, employeeIds: [], assignmentType: null, status: null },
      }),
      setTeamGrouped: (isTeamGrouped) => set({ isTeamGrouped }),

      setDragState: (dragState) => set({ dragState }),
      clearDragState: () => set({ dragState: null, conflictPreview: null }),
      setConflictPreview: (conflictPreview) => set({ conflictPreview }),

      pushUndo: (entry) => set((state) => ({
        undoStack: [{ ...entry, timestamp: Date.now() }, ...state.undoStack].slice(0, 5),
      })),
      popUndo: () => {
        const { undoStack } = get();
        if (!undoStack.length) return null;
        const [top, ...rest] = undoStack;
        set({ undoStack: rest });
        return top;
      },
      clearExpiredUndos: () => set((state) => ({
        undoStack: state.undoStack.filter((e) => Date.now() - e.timestamp < 30_000),
      })),
    }),
    {
      name: 'scheduling-store',
      partialize: (state) => ({
        view: state.view,
        filters: state.filters,
        isTeamGrouped: state.isTeamGrouped,
      }),
    }
  )
);
