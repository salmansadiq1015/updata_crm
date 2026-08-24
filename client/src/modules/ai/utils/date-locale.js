import { de, enUS, fr, it } from 'date-fns/locale';

/**
 * date-fns speaks English unless told otherwise, so relative times in the
 * assistant read "less than a minute ago" in an otherwise German interface.
 */
const LOCALES = { de, en: enUS, fr, it };

export function dateLocale(locale) {
  return LOCALES[locale] || de;
}
