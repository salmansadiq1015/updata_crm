'use client';

import { ArrowUpRight, BarChart3, BrainCircuit, PhoneCall, ReceiptText, ChevronDown, History, LockKeyhole, Plug, Radar, ShieldCheck, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { SUPPORT_EMAIL } from '@/shared/constants/application';
import { AuthAwareLink } from './auth-aware-link';
import { Reveal, SectionIntro } from './motion-primitives';

export function PlatformIntelligence() {
  const { t } = useLanguage();
  return <section id="intelligence" className="border-y border-white/[.07] bg-[#09101d] py-20 sm:py-24"><div className="mx-auto grid max-w-[1360px] gap-4 px-4 sm:px-6 lg:grid-cols-3 lg:px-10">
    {[[BrainCircuit, 'intelligence', '/ai-calling'], [BarChart3, 'analytics', '/dashboard'], [Plug, 'integrations', '/admin/integrations']].map(([Icon, key, href], index) => <Reveal key={key} delay={index * .06} className="flex flex-col rounded-2xl border border-white/[.08] bg-white/[.02] p-6 sm:p-8"><Icon aria-hidden="true" className="size-6 text-blue-200" /><h2 className="mt-7 max-w-xs text-xl font-medium leading-7 tracking-tight text-white">{t(`experience.${key}.title`)}</h2><p className="mt-4 flex-1 text-sm leading-7 text-slate-400">{t(`experience.${key}.body`)}</p><AuthAwareLink href={href} className="mt-6 inline-flex min-h-10 items-center gap-2 self-start text-sm font-medium text-blue-200">{t('experience.explore')}<ArrowUpRight aria-hidden="true" className="size-4" /></AuthAwareLink></Reveal>)}
  </div></section>;
}

export function PlatformAssurance() {
  const { t } = useLanguage();
  return <>
    <section id="security" className="py-20 sm:py-28"><div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10"><SectionIntro eyebrow={t('experience.security.eyebrow')} title={t('experience.security.title')} /><div className="mt-10 grid gap-8 sm:grid-cols-3">{[[Users, 'roles'], [LockKeyhole, 'tenant'], [History, 'audit']].map(([Icon, key]) => <Reveal key={key} className="border-t border-white/10 pt-6"><Icon aria-hidden="true" className="size-5 text-blue-200" /><h3 className="mt-5 text-base font-medium text-white">{t(`experience.security.${key}`)}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{t(`experience.security.${key}Body`)}</p></Reveal>)}</div></div></section>
    <section id="pricing" className="border-y border-white/[.07] bg-[#0b1220] py-20 sm:py-24"><div className="mx-auto grid max-w-[1360px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-10"><SectionIntro eyebrow={t('experience.pricing.eyebrow')} title={t('experience.pricing.title')} description={t('experience.pricing.body')} /><Reveal className="rounded-2xl border border-blue-200/15 bg-blue-200/[.025] p-7 sm:p-9"><ReceiptText aria-hidden="true" className="size-7 text-blue-200" /><div className="mt-7 space-y-4">{[[Radar, 'landing.nav.leadGeneration'], [PhoneCall, 'experience.calling.nav'], [Users, 'landing.footer.work']].map(([Icon, key]) => <p key={key} className="flex items-center gap-3 text-sm text-slate-300"><Icon aria-hidden="true" className="size-4 text-slate-400" />{t(key)}</p>)}</div><a href={`mailto:${SUPPORT_EMAIL}?subject=Updata%20pricing%20and%20access`} className="mt-8 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#dce6ff] px-5 text-sm font-semibold text-[#142858] transition-colors hover:bg-white">{t('experience.contact')}<ArrowUpRight aria-hidden="true" className="size-4" /></a></Reveal></div></section>
    <section id="resources" className="py-20 sm:py-28"><div className="mx-auto grid max-w-[1360px] gap-10 px-4 sm:px-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-20 lg:px-10"><SectionIntro eyebrow={t('experience.resources.nav')} title={t('experience.faq.title')} /><div>{[1, 2, 3, 4].map(index => <details key={index} className="group border-b border-white/10"><summary className="flex min-h-20 list-none items-center justify-between gap-4 py-5 text-sm font-medium text-slate-200 [&::-webkit-details-marker]:hidden">{t(`experience.faq.q${index}`)}<ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" /></summary><p className="pb-6 pe-8 text-sm leading-7 text-slate-400">{t(`experience.faq.a${index}`)}</p></details>)}</div></div></section>
  </>;
}
