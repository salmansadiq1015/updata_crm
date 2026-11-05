import { meaningfulBusinessCategory } from './business-category-label';
import type { Lead, SearchRecord } from './types';
import { normalizeBusinessTypes } from './campaign';

/** Preserve a real Maps category; otherwise use this lead's own discovery task. */
export function businessCategory(lead: Partial<Pick<Lead, 'category' | 'categories' | 'discoveryCategories' | 'businessName'>>): string | null {
  const meaningful = (value: unknown) => meaningfulBusinessCategory(value, lead.businessName);
  return meaningful(lead.category)
    || (lead.categories ?? []).map(meaningful).find(Boolean)
    // Discovery types are explicit user input, not scraped Maps metadata.
    || (lead.discoveryCategories ?? []).map((value) => value.trim()).find(Boolean)
    || null;
}

/** Recover older local records from their saved search, never the current form. */
export function withImportSearchContext(lead: Lead, search?: SearchRecord): Lead {
  if (!search) return lead;
  const types = search.campaign?.selectedBusinessTypes
    ?? normalizeBusinessTypes({ businessType: search.config?.businessType ?? search.businessType, businessTypes: search.businessTypes ?? search.config?.businessTypes });
  const location = (search.location || search.config?.location || '').trim();
  const isPlace = location && !/^current maps context$/i.test(location)
    && !types.some((type) => type.toLocaleLowerCase() === location.toLocaleLowerCase());
  return {
    ...lead,
    searchLocation: lead.searchLocation?.trim() || (isPlace ? location : null),
    // A historical multi-type search without per-lead provenance is ambiguous.
    discoveryCategories: lead.discoveryCategories?.length ? lead.discoveryCategories : types.length === 1 ? types : [],
  };
}
