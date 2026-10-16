import type { TFunction } from 'i18next';

/**
 * Translate a key built from server or runtime data (CRM field keys, error codes,
 * statuses). Typed keys are preferred; this is the one escape hatch, so an unknown
 * value shows `defaultValue` (or the key) instead of failing the type check.
 */
export function tKey(t: TFunction, key: string, options?: Record<string, unknown>): string {
  return String((t as unknown as (key: string, options?: Record<string, unknown>) => unknown)(key, options));
}
