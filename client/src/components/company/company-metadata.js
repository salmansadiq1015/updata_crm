import { cookies } from 'next/headers';
import { companyTranslations } from '@/lib/i18n/company-translations';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/i18n/locale-config';

export async function companyMetadata(page) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const copy = companyTranslations[locale];
  return {
    title: `${copy[`company.${page}.name`]} — Updata`,
    description: copy[`company.${page}.description`],
  };
}
