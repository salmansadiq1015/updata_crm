/**
 * Reset emails link to the web CRM (`<client>/reset-password?token=…`). Users can
 * paste that whole link, or just the token, into the app.
 */
export function extractResetToken(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const fromQuery = value.match(/[?&]token=([^&#\s]+)/);
  if (fromQuery?.[1]) {
    try {
      return decodeURIComponent(fromQuery[1]);
    } catch {
      return null;
    }
  }
  // A bare token: no whitespace, no URL syntax.
  return /^[A-Za-z0-9._~-]{16,}$/.test(value) ? value : null;
}
