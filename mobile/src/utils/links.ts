// Builders for the URLs handed to the OS (dialer, mail, browser, maps). Calling
// goes through the system dialer, so the app needs no CALL_PHONE permission.

/** Digits only, `00` international prefix normalised to `+`; null when not dialable. */
export function toTelUri(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 3) return null;
  return `tel:${international ? '+' : ''}${digits}`;
}

export function toMailtoUri(email: string | null | undefined): string | null {
  const value = email?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? `mailto:${value}` : null;
}

// React Native's URL class never throws on malformed input, so validate explicitly.
const WEB_URL = /^https?:\/\/[^\s/?#@]+\.[^\s/?#@]+(?:[/?#]\S*)?$/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Websites are stored with or without a scheme; only http(s) ever leaves the app. */
export function toWebUrl(website: string | null | undefined): string | null {
  const value = website?.trim();
  if (!value) return null;
  const candidate = HAS_SCHEME.test(value) ? value : `https://${value}`;
  return WEB_URL.test(candidate) ? candidate : null;
}

/** A Maps search for the address when no provider link is stored. */
export function toMapsUrl(mapsUrl: string | null, address: string | null): string | null {
  if (mapsUrl) return toWebUrl(mapsUrl);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
