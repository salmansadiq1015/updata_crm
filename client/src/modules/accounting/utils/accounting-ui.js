export function formatMoney(value, currency = 'CHF', options = {}) {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency,
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('de-CH');
}

export function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function downloadResponse(response, fallbackFileName, contentType = 'text/csv') {
  const blob = response?.data instanceof Blob
    ? response.data
    : new Blob([response?.data || ''], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackFileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function cursorPageLabel(stackLength) {
  return `Page ${Math.max(1, stackLength + 1)}`;
}
