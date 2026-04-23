const EMPTY_PATTERNS = [
  /^<p>\s*<\/p>$/,
  /^<p><br\s*\/?>\s*<\/p>$/,
  /^<p>\s*<br\s*\/?>\s*<\/p>$/,
  /^\s*$/,
];

export function stripEmptyHtml(html) {
  if (!html) return null;
  const trimmed = html.trim();
  if (!trimmed) return null;
  for (const pattern of EMPTY_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }
  return trimmed;
}

export function htmlToPlainText(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}
