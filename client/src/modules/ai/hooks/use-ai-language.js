'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const LOCALE_TO_VOICE = {
  de: 'de-CH',
  en: 'en',
  fr: 'fr-CH',
  it: 'it-CH',
};

/**
 * Resolves STT/NLP language from user profile preference or UI locale.
 */
export function useAiLanguage() {
  const { locale } = useLanguage();

  const profileQuery = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => apiClient.get(ENDPOINTS.AUTH.ME).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const profileLang = profileQuery.data?.language || profileQuery.data?.preferences?.language;
  const fromProfile = profileLang ? (LOCALE_TO_VOICE[profileLang.split('-')[0]] || profileLang) : null;
  const fromLocale = LOCALE_TO_VOICE[locale] || 'de-CH';

  return fromProfile || fromLocale;
}
