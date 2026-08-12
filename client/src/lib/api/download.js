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

/**
 * Download a file from a remote URL and save it with the given filename.
 * Uses fetch + blob so the browser's download dialog uses `filename` even for
 * cross-origin URLs (e.g. pre-signed S3 links).
 */
export async function downloadFromUrl(url, filename) {
  if (typeof window === 'undefined') return;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    downloadBlob(blob, filename);
  } catch {
    // Fallback: open in new tab (e.g. when fetch is blocked by CORS)
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
