import { normalizeBusinessType } from './businessTypeLabel.js';

const meaningfulType = (value) => {
  const type = normalizeBusinessType(value);
  return type && !/^(business|establishment|point[ _]of[ _]interest)$/i.test(type) ? type : null;
};

export function extensionBusinessType(record = {}) {
  return [record.category, ...(Array.isArray(record.categories) ? record.categories : []),
    ...(Array.isArray(record.discoveryCategories) ? record.discoveryCategories : [])]
    .map(meaningfulType).find(Boolean) ?? null;
}

/** Signatures written by the old extension importers, not by general imports. */
export function isLegacyExtensionLead(lead = {}) {
  if (!['google_places', 'import'].includes(lead.source)) return false;
  const mapsLink = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\//i;
  if (typeof lead.notes !== 'string') return false;
  return (lead.notes.startsWith('Google Maps address: ') && mapsLink.test(lead.providerMeta?.mapsUrl ?? ''))
    || (lead.notes.startsWith('Google Maps: ') && mapsLink.test(lead.notes.slice('Google Maps: '.length)));
}
