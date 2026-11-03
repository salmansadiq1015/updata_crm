import type { Lead, SearchRecord } from './types';
import { normalizeBusinessTypes } from './campaign';

/** Preserve a real Maps category; otherwise use this lead's own discovery task. */
export function businessCategory(lead: Partial<Pick<Lead, 'category' | 'categories' | 'discoveryCategories' | 'businessName'>>): string | null {
  const meaningful = (value: string | null | undefined) => {
    const text = value?.replace(/\s+/g, ' ').trim();
    if (!text || /^(business|establishment|point[_ ]of[_ ]interest|other|unknown|n\/a)$/i.test(text)) return null;
    // Older extractions used arbitrary card text as the category. Reject Maps
    // metadata here as well so saved leads, exports and both import paths recover.
    if (/\b(reviews?|ratings?|stars?|avis|bewertungen|reseñas?|recensioni|avaliações|appointments?|services? on.?site)\b|مراجعات|تقييمات/i.test(text)
      || /^(?:on.?site services?|online (?:appointments?|estimates?)|open|closed|opens?|closes?|directions|website|sponsored)\b/i.test(text)
      || /^(?:n[°ºo.]\s*\d|#?\d[\d., ()]*)$/i.test(text)
      || !/\p{L}/u.test(text)) return null;
    const name = lead.businessName?.trim().toLocaleLowerCase();
    if (name && text.toLocaleLowerCase().startsWith(name)) return null;
    return text;
  };
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
