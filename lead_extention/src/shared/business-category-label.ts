/** Accept business categories, never Google Maps action/button text. */
export function meaningfulBusinessCategory(value: unknown, businessName?: string): string | null {
  if (typeof value !== 'string') return null;
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text || /^(business|establishment|point[_ ]of[_ ]interest|other|unknown|n\/a)$/i.test(text)) return null;
  if (/^(?:\+\s*)?(?:add (?:a )?label|edit (?:a )?label|your labels?|suggest an edit|write (?:a )?review|claim this business|ajouter un libell[eé]|ajouter une [eé]tiquette|modifier le libell[eé]|label hinzuf[uü]gen|etikett hinzuf[uü]gen|(?:a[nñ]adir|agregar) (?:una )?etiqueta)[.!…]*$/iu.test(text.replace(/[_-]+/g, ' '))) return null;
  // Older extractions used arbitrary card text as the category. Reject Maps
  // metadata here as well so saved leads, exports and both import paths recover.
  if (/\b(reviews?|ratings?|stars?|avis|bewertungen|reseñas?|recensioni|avaliações|appointments?|services? on.?site)\b|مراجعات|تقييمات/i.test(text)
    || /^(?:on.?site services?|online (?:appointments?|estimates?)|open|closed|opens?|closes?|directions|website|sponsored)\b/i.test(text)
    || /^(?:n[°ºo.]\s*\d|#?\d[\d., ()]*)$/i.test(text)
    || !/\p{L}/u.test(text)) return null;
  const name = businessName?.trim().toLocaleLowerCase();
  if (name && text.toLocaleLowerCase().startsWith(name)) return null;
  return text;
}
