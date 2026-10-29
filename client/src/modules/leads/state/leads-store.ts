'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { LeadSource, LeadStatus, LeadType } from '../types/lead-types';

export type LeadsFilters = {
  status: LeadStatus | 'ALL';
  source: LeadSource | 'ALL';
  type: LeadType | 'ALL';
  /** Address geography returned by the database-backed filter-options endpoint. */
  country: string;
  city: string;
  area: string;
  /** A business category (e.g. "Chinese restaurant") from filter-options, or 'ALL'. */
  businessType: string;
  /** Lead score band (hot / warm / cold / unscored) or 'ALL'. */
  scoreBand: string;
  // 'ALL' = everyone, 'ME' = current user, or a specific user id.
  assignedTo: string;
  search: string;
};

export type LeadsSort = {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

const INITIAL_FILTERS: LeadsFilters = {
  status: 'ALL',
  source: 'ALL',
  type: 'ALL',
  country: 'ALL',
  city: 'ALL',
  area: 'ALL',
  businessType: 'ALL',
  scoreBand: 'ALL',
  assignedTo: 'ALL',
  search: '',
};

const INITIAL_SORT: LeadsSort = { sortBy: 'createdAt', sortOrder: 'desc' };

type LeadsState = {
  filters: LeadsFilters;
  sort: LeadsSort;
  rowSelection: Record<string, boolean>;
  selectedLeadId: string | null;

  setFilters: (patch: Partial<LeadsFilters>) => void;
  clearFilters: () => void;
  setSort: (sort: LeadsSort) => void;
  setRowSelection: (selection: Record<string, boolean>) => void;
  toggleRow: (id: string) => void;
  clearSelection: () => void;
  setSelectedLeadId: (id: string | null) => void;
  reset: () => void;
};

export const useLeadsStore = create<LeadsState>((set) => ({
  filters: INITIAL_FILTERS,
  sort: INITIAL_SORT,
  rowSelection: {},
  selectedLeadId: null,

  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  clearFilters: () => set({ filters: INITIAL_FILTERS }),
  setSort: (sort) => set({ sort }),
  setRowSelection: (rowSelection) => set({ rowSelection }),
  toggleRow: (id) =>
    set((state) => {
      const next = { ...state.rowSelection };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { rowSelection: next };
    }),
  clearSelection: () => set({ rowSelection: {} }),
  setSelectedLeadId: (selectedLeadId) => set({ selectedLeadId }),
  reset: () =>
    set({
      filters: INITIAL_FILTERS,
      sort: INITIAL_SORT,
      rowSelection: {},
      selectedLeadId: null,
    }),
}));

// ── Selector hooks (useShallow) ───────────────────────────────────────────────

export const useLeadsFilters = () =>
  useLeadsStore(
    useShallow((state) => ({
      filters: state.filters,
      sort: state.sort,
      setFilters: state.setFilters,
      clearFilters: state.clearFilters,
      setSort: state.setSort,
    })),
  );

export const useLeadsRowSelection = () => useLeadsStore((state) => state.rowSelection);

export const useSelectedLeadIds = () =>
  useLeadsStore(
    useShallow((state) => Object.keys(state.rowSelection).filter((id) => state.rowSelection[id])),
  );

export const useSelectedLeadId = () => useLeadsStore((state) => state.selectedLeadId);
