import { useLanguage as useLanguageImpl } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import type { T } from '../inbound-domain';

type InboundLanguage = { t: T; locale: string; intlLocale: string; isRTL: boolean };
const useLanguageTyped = useLanguageImpl as unknown as () => { t: T; locale: string; isRTL?: boolean };

const interpolate = (text: string, vars?: Record<string, string | number | null | undefined>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (vars?.[k] != null ? String(vars[k]) : m));
const FALLBACK: InboundLanguage = { t: (key, fallback, vars) => interpolate(fallback ?? key, vars), locale: 'en', intlLocale: 'en-GB', isRTL: false };

/** Typed view of the app's language context; English fallbacks where no provider is mounted (tests, embeds). */
export function useInboundLanguage(): InboundLanguage {
  try {
    const l = useLanguageTyped();
    return { t: l.t, locale: l.locale, intlLocale: intlLocaleFor(l.locale), isRTL: Boolean(l.isRTL) };
  } catch {
    return FALLBACK;
  }
}
