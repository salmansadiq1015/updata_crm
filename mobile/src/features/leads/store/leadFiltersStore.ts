// Leads list filters survive tab switches but not a restart; they are UI state,
// not server data, so they live here rather than in the query cache. Same filter set
// as the web CRM list (status, source, assignee, type, sort); geography facets are web-only.
import { create } from 'zustand';

import type { LeadListFilters, LeadSortField, LeadStatus, SortOrder } from '../types';

export type LeadAdvancedFilters = Pick<LeadListFilters, 'source' | 'type' | 'assignedTo'> & {
  sortBy: LeadSortField;
  sortOrder: SortOrder;
};

export const DEFAULT_ADVANCED: LeadAdvancedFilters = {
  source: undefined,
  type: undefined,
  assignedTo: undefined,
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

type LeadFiltersState = {
  search: string;
  status: LeadStatus | undefined;
  advanced: LeadAdvancedFilters;
  setSearch: (search: string) => void;
  setStatus: (status: LeadStatus | undefined) => void;
  setAdvanced: (advanced: LeadAdvancedFilters) => void;
  reset: () => void;
};

export const useLeadFiltersStore = create<LeadFiltersState>()((set) => ({
  search: '',
  status: undefined,
  advanced: DEFAULT_ADVANCED,
  setSearch: (search) => set({ search }),
  setStatus: (status) => set({ status }),
  setAdvanced: (advanced) => set({ advanced }),
  reset: () => set({ search: '', status: undefined, advanced: DEFAULT_ADVANCED }),
}));

/** Number of non-default advanced filters (for the filter button badge). */
export function countAdvanced(advanced: LeadAdvancedFilters): number {
  return (
    Number(Boolean(advanced.source)) +
    Number(Boolean(advanced.type)) +
    Number(Boolean(advanced.assignedTo)) +
    Number(advanced.sortBy !== DEFAULT_ADVANCED.sortBy || advanced.sortOrder !== DEFAULT_ADVANCED.sortOrder)
  );
}
