const MAX_CHARS = 200;
const MIN_WORDS = 3;

export function splitIntoChunks(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z"'])/);

  // If no split (single sentence), return as-is
  if (parts.length === 1) return parts;

  // Multiple sentences - each one is a potential chunk
  // But first, handle any that exceed MAX_CHARS by breaking them up
  const chunks = [];

  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length <= MAX_CHARS) {
      // Fits within limit, add as-is
      chunks.push(parts[i]);
    } else {
      // Exceeds MAX_CHARS - this shouldn't normally happen
      // but if it does, combine with neighbors to spread it out
      if (i === 0) {
        // First chunk that's too long - try combining with next
        if (i + 1 < parts.length) {
          const combined = `${parts[i]} ${parts[i + 1]}`;
          chunks.push(combined);
          i++; // Skip the next part since we combined it
        } else {
          // No next part, add it anyway
          chunks.push(parts[i]);
        }
      } else {
        // Not first, try combining with previous chunk
        const prev = chunks.pop();
        const combined = `${prev} ${parts[i]}`;
        chunks.push(combined);
      }
    }
  }

  // If only one chunk, return as-is
  if (chunks.length === 1) return chunks;

  // Multiple chunks: filter out very small ones (< MIN_WORDS)
  const filtered = chunks.filter((c) => c.split(/\s+/).length >= MIN_WORDS);

  // Return filtered if any remain, otherwise return original chunks
  return filtered.length > 0 ? filtered : chunks;
}
