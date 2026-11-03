'use client';

import Image from 'next/image';
import { ArrowRight, ArrowUpRight, Bot, FolderKanban, Radar, Network, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Reveal } from './motion-primitives';
import { AuthAwareLink } from './auth-aware-link';

export function CtaSection() {
  const { t } = useLanguage();
  const modules = [
    [Radar, t('landing.ecosystem.leadgen')],
    [Users, t('landing.ecosystem.customers')],
    [FolderKanban, t('landing.ecosystem.projects')],
    [Bot, t('landing.ecosystem.ai')],
  ];

  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
      <Reveal className="relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] border border-blue-200/[0.13] bg-[#071326] px-6 py-8 shadow-[0_40px_140px_rgba(0,0,0,.42)] sm:px-9 sm:py-10 lg:px-12 lg:py-12">
        <div className="landing-cta-mesh pointer-events-none absolute inset-0 opacity-35" />
        <div className="pointer-events-none absolute -start-32 -top-52 size-[520px] rounded-full bg-blue-500/16 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-52 end-[-40px] size-[520px] rounded-full bg-cyan-500/12 blur-[130px]" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[1.02fr_.98fr] lg:items-center xl:gap-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200"><Network className="size-3" />{t('landing.cta.eyebrow')}</p>
            <h2 className="mt-5 text-[clamp(2.45rem,4.6vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">{t('landing.cta.title1')}<br /><span className="landing-gradient-text">{t('landing.cta.title2')}</span></h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{t('landing.cta.description')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#lead-generation" className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('landing.cta.primary')}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" /></a>
              <AuthAwareLink href="/dashboard" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.14] bg-white/[0.05] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('landing.cta.portal')}<ArrowUpRight className="size-4" /></AuthAwareLink>
            </div>
          </div>

          <div className="relative min-h-[310px] overflow-hidden rounded-[22px] border border-blue-200/[0.14] bg-[#06101f] shadow-[0_28px_90px_rgba(0,0,0,.36)] sm:min-h-[360px]">
            <Image src="/landing/connected-operations-blue.png" alt="" fill sizes="(min-width: 1024px) 42vw, 92vw" className="object-cover object-[68%_center] opacity-70" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,12,25,.18),rgba(5,12,25,.42)_60%,#050c19)]" />
            <div className="absolute start-5 top-5 flex items-center gap-2 rounded-full border border-cyan-300/20 bg-[#06101f]/80 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-100 backdrop-blur-md"><span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,.9)]" />{t('landing.cta.eyebrow')}</div>
            <div className="absolute inset-x-4 bottom-4 grid grid-cols-2 gap-2 sm:inset-x-5 sm:grid-cols-4">
              {modules.map(([Icon, label]) => <div key={label} className="rounded-xl border border-white/[0.1] bg-[#071326]/82 p-3 backdrop-blur-md"><Icon className="size-4 text-cyan-300" /><p className="mt-2 text-[8px] font-medium text-slate-200">{label}</p></div>)}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
