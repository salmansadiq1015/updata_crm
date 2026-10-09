import type { Lead, SearchRecord } from './types';

/**
 * Pick one immutable discovery result set for the active workspace. A newly
 * started/failed search with zero valid rows does not blank the previous set.
 */
export function visibleSearchIdFor(
  leads: Lead[],
  searches: SearchRecord[],
  currentSearchId: string | null | undefined,
): string | null {
  if (currentSearchId && leads.some((lead) => !lead.archived && lead.searchId === currentSearchId)) {
    return currentSearchId;
  }
  return searches.find((search) =>
    leads.some((lead) => !lead.archived && lead.searchId === search.id))?.id ?? null;
}

export function partitionSearchLeads(leads: Lead[], visibleSearchId: string | null): {
  active: Lead[];
  history: Lead[];
} {
  return {
    active: leads.filter((lead) => !lead.archived && (!visibleSearchId || lead.searchId === visibleSearchId)),
    history: leads.filter((lead) => Boolean(lead.archived) || Boolean(visibleSearchId && lead.searchId !== visibleSearchId)),
  };
}
