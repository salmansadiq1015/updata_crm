const MAX_CHARS = 200;
const MIN_WORDS = 3;

function hardWrap(text) {
  const result = [];
  let remaining = text;
  while (remaining.length > MAX_CHARS) {
    let cut = remaining.lastIndexOf(' ', MAX_CHARS);
    if (cut <= 0) cut = MAX_CHARS; // no space found — hard cut at limit
    result.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

export function splitIntoChunks(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  const raw = [];

  for (const part of parts) {
    if (part.length > MAX_CHARS) {
      raw.push(...hardWrap(part));
    } else {
      raw.push(part);
    }
  }

  if (raw.length === 1) return raw;

  // Multiple chunks: filter out very small ones (< MIN_WORDS)
  const filtered = raw.filter((c) => c.split(/\s+/).length >= MIN_WORDS);

  // Return filtered if any remain, otherwise return original chunks
  return filtered.length > 0 ? filtered : raw;
}
