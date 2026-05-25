function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date
    ? value.toISOString()
    : String(value);
  const safeText = /^[=+@]/.test(text) || /^-(?!\d+(\.\d+)?$)/.test(text) ? `'${text}` : text;
  if (!/[",\r\n]/.test(safeText)) return safeText;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function toCsv(headers, rows) {
  return [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(',')),
  ].join('\n');
}

export function formatDateOnly(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
