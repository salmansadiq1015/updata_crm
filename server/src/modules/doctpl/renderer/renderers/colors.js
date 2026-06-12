const DEFAULT_COLORS = {
  primary: '#1B3F8B',
  secondary: '#D4002A',
  text: '#1A1A1A',
  muted: '#6B7280',
  border: '#E5E7EB',
  tableHeader: '#F3F4F6',
};

function normalizeColor(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function pdfColors(ciConfig = {}) {
  const source = ciConfig.colors || {};
  return Object.fromEntries(
    Object.entries(DEFAULT_COLORS).map(([key, fallback]) => [
      key,
      normalizeColor(source[key], fallback),
    ]),
  );
}
