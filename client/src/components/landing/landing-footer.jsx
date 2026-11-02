'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Mail, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { SUPPORT_EMAIL } from '@/shared/constants/application';

export function LandingFooter() {
  const { t } = useLanguage();
  const groups = [
    {
      title: 'product',
      links: [
        ['dashboard', '/dashboard'], ['leadgen', '/lead-generation'], ['crm', '/crm/customers'], ['projects', '/projects'], ['ai', '/ai'],
      ],
    },
    {
      title: 'work',
      links: [['tasks', '/tasks'], ['calendar', '/scheduling/calendar'], ['customers', '/crm/customers'], ['quotes', '/quotes']],
    },
  ];
  return (
    <footer className="border-t border-white/[0.07] bg-[#050a13]">
      <div className="mx-auto max-w-[1440px] px-4 pb-8 pt-14 sm:px-6 lg:px-10 lg:pt-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_.72fr_.72fr_.72fr_.72fr]">
          <div className="max-w-sm">
            <Image src="/updata-logo-dark.svg" alt="Updata ERP" width={220} height={56} className="h-9 w-auto" />
            <p className="mt-5 text-sm leading-6 text-slate-500">{t('landing.footer.description')}</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-colors hover:text-white"><Mail className="size-3.5" />{SUPPORT_EMAIL}</a>
          </div>

          {groups.map((group) => <div key={group.title}><h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t(`landing.footer.${group.title}`)}</h3><ul className="mt-4 space-y-3">{group.links.map(([label, href]) => <li key={label}><Link href={href} className="text-xs text-slate-400 transition-colors hover:text-white">{t(`landing.footer.${label}`)}</Link></li>)}</ul></div>)}

          <div><h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t('landing.footer.company')}</h3><ul className="mt-4 space-y-3"><li><Link href="/about" className="text-xs text-slate-400 transition-colors hover:text-white">{t('landing.footer.about')}</Link></li><li><Link href="/contact" className="text-xs text-slate-400 transition-colors hover:text-white">{t('landing.footer.contact')}</Link></li><li><Link href="/support" className="text-xs text-slate-400 transition-colors hover:text-white">{t('landing.footer.support')}</Link></li></ul></div>
          <div><h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t('landing.footer.legal')}</h3><ul className="mt-4 space-y-3"><li><Link href="/privacy" className="text-xs text-slate-400 transition-colors hover:text-white">{t('landing.footer.privacy')}</Link></li><li><Link href="/terms" className="text-xs text-slate-400 transition-colors hover:text-white">{t('landing.footer.terms')}</Link></li><li><Link href="/security" className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-white"><ShieldCheck className="size-3" />{t('landing.footer.security')}</Link></li></ul></div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/[0.07] pt-6 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} {t('landing.footer.copyright')}</p><p>{t('experience.footer')}</p></div>
      </div>
    </footer>
  );
}
