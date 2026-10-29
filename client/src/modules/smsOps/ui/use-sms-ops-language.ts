import { useLanguage as useLanguageImpl } from '@/lib/i18n/language-context';
import type { T } from '../sms-ops-domain';

type SmsOpsLanguage = { t: T; locale: string; dir?: 'ltr' | 'rtl'; isRTL?: boolean };
const useLanguageTyped = useLanguageImpl as unknown as () => SmsOpsLanguage;

const interpolate = (text: string, vars?: Record<string, string | number | null | undefined>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (vars?.[k] != null ? String(vars[k]) : m));
/** English fallbacks when a widget is rendered outside the app's LanguageProvider (embedded/tests). */
const FALLBACK: SmsOpsLanguage = { t: (key, fallback, vars) => interpolate(fallback ?? key, vars), locale: 'en', dir: 'ltr', isRTL: false };

/**
 * Typed view of the app's (untyped .jsx) language context. The smsOps widgets are
 * embedded in other modules' screens (lead drawer, campaign views), so they must not
 * crash where no provider is mounted. useContext runs on every render either way,
 * so the hook order stays stable.
 */
export function useSmsOpsLanguage(): SmsOpsLanguage {
  try {
    return useLanguageTyped();
  } catch {
    return FALLBACK;
  }
}
