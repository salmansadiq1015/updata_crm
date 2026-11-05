'use client';

import { ArrowRight, ArrowDown, LockKeyhole } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { DashboardVisual } from './landing-visuals';
import { AuthAwareLink } from './auth-aware-link';
import { HeroParticles } from './hero-particles';

export function HeroSection() {
  const { t } = useLanguage();
  return (
    <section id="product" className="relative isolate overflow-hidden px-4 pb-16 pt-32 sm:px-6 sm:pb-24 sm:pt-40 lg:px-10">
      <div aria-hidden="true" className="landing-grid-mask pointer-events-none absolute inset-0 -z-10 opacity-25" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[700px] bg-[radial-gradient(ellipse_at_50%_25%,rgba(47,82,184,.23),transparent_65%)]" />
      <HeroParticles />
      <div className="mx-auto max-w-[1280px]">
        <div className="mx-auto max-w-4xl text-center">
          <motion.h1 initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .06 }} className="text-[clamp(2.5rem,5.4vw,4.7rem)] font-medium leading-[1.09] tracking-[-.05em] text-white">
            {t('experience.hero.before')}<br className="hidden sm:block" />{' '}<span className="text-[#9fb9fc]">{t('experience.hero.accent')}</span>{' '}{t('experience.hero.after')}
          </motion.h1>
          <motion.p initial={false} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, delay: .14 }} className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">{t('experience.hero.description')}</motion.p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <AuthAwareLink href="/dashboard" className="group inline-flex min-h-12 items-center gap-3 rounded-xl bg-[#dce6ff] px-6 text-sm font-semibold text-[#142858] shadow-[0_4px_24px_rgba(78,116,219,.18)] transition-colors hover:bg-white">{t('experience.start')}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" /></AuthAwareLink>
            <a href="#lead-generation" className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-white/15 bg-white/[.025] px-6 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[.07]">{t('experience.explore')}<ArrowDown aria-hidden="true" className="size-4" /></a>
          </div>
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400"><LockKeyhole aria-hidden="true" className="size-3.5 text-blue-300" />{t('experience.hero.note')}</p>
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .2 }} className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
          <div aria-hidden="true" className="absolute -inset-5 -z-10 rounded-[40px] border border-white/[.04] bg-white/[.015] sm:-inset-3" />
          <DashboardVisual className="shadow-[0_32px_90px_rgba(0,0,0,.35)]" />
        </motion.div>
      </div>
    </section>
  );
}
