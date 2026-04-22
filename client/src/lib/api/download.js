/**
 * Trigger a browser file download from a Blob or string payload.
 * Works from any client component; no-op on the server.
 */
export function downloadBlob(payload, filename, mimeType = 'application/octet-stream') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = payload instanceof Blob ? payload : new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
