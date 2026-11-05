import { normalizeBusinessType } from './businessTypeLabel.js';

const meaningfulType = (value, name) => {
  if (typeof value !== 'string') return null;
  const type = normalizeBusinessType(value);
  if (/^(?:\+\s*)?(?:add (?:a )?label|edit (?:a )?label|your labels?|suggest an edit|write (?:a )?review|claim this business|ajouter un libell[eé]|ajouter une [eé]tiquette|modifier le libell[eé]|label hinzuf[uü]gen|etikett hinzuf[uü]gen|(?:a[nñ]adir|agregar) (?:una )?etiqueta)[.!…]*$/iu.test(type ?? '')) return null;
  if (!type || /^(business|establishment|point[ _]of[ _]interest|other|unknown|n\/a)$/i.test(type)) return null;
  if (/\b(reviews?|ratings?|stars?|avis|bewertungen|reseñas?|recensioni|avaliações|appointments?|services? on.?site)\b|مراجعات|تقييمات/i.test(type)
    || /^(?:on.?site services?|online (?:appointments?|estimates?)|open|closed|opens?|closes?|directions|website|sponsored)\b/i.test(type)
    || /^(?:n[°ºo.]\s*\d|#?\d[\d., ()]*)$/i.test(type)
    || !/\p{L}/u.test(type)) return null;
  if (name && type.toLocaleLowerCase().startsWith(name.trim().toLocaleLowerCase())) return null;
  return type;
};

export function extensionBusinessType(record = {}) {
  return [record.category, ...(Array.isArray(record.categories) ? record.categories : [])]
    .map((value) => meaningfulType(value, record.businessName)).find(Boolean)
    ?? (Array.isArray(record.discoveryCategories) ? record.discoveryCategories : [])
      .map((value) => meaningfulType(typeof value === 'string' ? value : value?.name || value?.id, null)).find(Boolean) ?? null;
}

/** Signatures written by the old extension importers, not by general imports. */
export function isLegacyExtensionLead(lead = {}) {
  if (!['google_places', 'import'].includes(lead.source)) return false;
  const mapsLink = /^https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\//i;
  if (typeof lead.notes !== 'string') return false;
  return (lead.notes.startsWith('Google Maps address: ') && mapsLink.test(lead.providerMeta?.mapsUrl ?? ''))
    || (lead.notes.startsWith('Google Maps: ') && mapsLink.test(lead.notes.slice('Google Maps: '.length)));
}
