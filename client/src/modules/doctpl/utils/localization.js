const SWISS_DATE_LOCALES = {
  de: 'de-CH',
  fr: 'fr-CH',
  it: 'it-CH',
  en: 'en-CH',
};

export function getSwissDateLocale(locale) {
  return SWISS_DATE_LOCALES[locale] || SWISS_DATE_LOCALES.de;
}

export function formatSwissDate(value, locale, fallback = '-') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(getSwissDateLocale(locale));
}
