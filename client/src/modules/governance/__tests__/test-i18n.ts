import { platformGovernanceTranslations } from '@/lib/i18n/platform-governance-translations';

/** English `t` for component tests (same lookup + {var} interpolation as the provider). */
export function makeT() {
  const dict = platformGovernanceTranslations.en as Record<string, string>;
  return (key: string, fallback?: string, vars?: Record<string, string | number>) => {
    let text = dict[key] ?? fallback ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  };
}
