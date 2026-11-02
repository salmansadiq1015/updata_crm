'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, PhoneCall, Radar, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { APP_LOGOS, APP_PRODUCT_NAME, COMPANY_NAME } from '@/shared/constants/application';
import { LanguageToggle } from '@/layout/language-toggle';
import { ThemeToggle } from '@/layout/theme-toggle';

export function AuthLayout({ children }) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="relative hidden w-[44%] max-w-[680px] overflow-hidden border-e border-white/10 bg-[#080e1a] lg:flex">
        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
          <Link href="/" aria-label={APP_PRODUCT_NAME}><Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="h-10 w-auto" /></Link>
          <div className="py-12">
            <div className="relative mb-10 aspect-[3/2] overflow-hidden rounded-3xl border border-white/5"><Image src="/landing/ai-voice-sculpture-1280.webp" alt="" fill sizes="44vw" className="object-cover" priority /></div>
            <h2 className="max-w-sm text-3xl font-medium leading-tight tracking-[-.035em] text-white xl:text-4xl">{t('experience.auth.title')}</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">{t('experience.auth.body')}</p>
            <div className="mt-8 flex flex-wrap gap-2">{[[Radar, 'landing.nav.leadGeneration'], [PhoneCall, 'experience.calling.nav'], [ShieldCheck, 'landing.footer.security']].map(([Icon, key]) => <span key={key} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300"><Icon aria-hidden="true" className="size-3.5 text-blue-200" />{t(key)}</span>)}</div>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} {COMPANY_NAME}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 p-4 sm:px-8 sm:py-6">
          <Link href="/" className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ArrowUpRight aria-hidden="true" className="size-4 rtl:rotate-180" />{t('landing.nav.product')}</Link>
          <div className="flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-12 pt-6 sm:px-12 lg:px-16">
          <div className="w-full max-w-[400px]">
            <Link href="/" className="mb-10 inline-block lg:hidden"><Image src={APP_LOGOS.full} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="block h-9 w-auto dark:hidden" /><Image src={APP_LOGOS.fullDark} alt={APP_PRODUCT_NAME} priority width={220} height={56} className="hidden h-9 w-auto dark:block" /></Link>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
