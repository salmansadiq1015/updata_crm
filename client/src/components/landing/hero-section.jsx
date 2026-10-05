'use client';

import Image from 'next/image';
import { ArrowDown, ArrowUpRight, Play, Sparkles } from 'lucide-react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { DashboardVisual } from './landing-visuals';
import { AuthAwareLink } from './auth-aware-link';

export function HeroSection() {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const previewY = useTransform(scrollY, [0, 900], [0, reduceMotion ? 0 : 64]);
  const signalY = useTransform(scrollY, [0, 900], [0, reduceMotion ? 0 : -36]);
  const backgroundY = useTransform(scrollY, [0, 900], [0, reduceMotion ? 0 : 90]);

  const signals = [
    { value: '248', label: t('landing.hero.signal.discovered'), color: 'text-cyan-300', pos: '-start-5 top-[18%] xl:-start-16' },
    { value: '18', label: t('landing.hero.signal.opportunities'), color: 'text-blue-200', pos: '-end-3 top-[8%] xl:-end-14' },
    { value: '12', label: t('landing.hero.signal.tasks'), color: 'text-emerald-300', pos: '-start-2 bottom-[7%] xl:-start-12' },
    { value: '●', label: t('landing.hero.signal.ai'), color: 'text-emerald-300', pos: '-end-4 bottom-[16%] xl:-end-16' },
  ];

  return (
    <section id="product" className="relative isolate overflow-hidden pb-16 pt-28 sm:pb-24 sm:pt-36 lg:min-h-[850px] lg:pb-28 lg:pt-40">
      <motion.div style={{ y: backgroundY }} className="pointer-events-none absolute inset-0 -z-20">
        <Image src="/landing/connected-operations-blue.png" alt="" fill priority sizes="100vw" className="object-cover object-center opacity-[0.19]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#060b16_0%,rgba(6,11,22,.9)_34%,rgba(6,11,22,.28)_72%,#060b16_100%)]" />
        <div className="absolute -top-80 start-[45%] size-[760px] rounded-full bg-blue-600/[0.13] blur-[130px]" />
        <div className="absolute top-16 end-[-220px] size-[620px] rounded-full bg-cyan-600/[0.09] blur-[150px]" />
        <div className="absolute inset-x-0 top-0 h-[760px] bg-[linear-gradient(to_bottom,rgba(10,18,36,.12),#060b16_82%)]" />
      </motion.div>
      <div className="landing-grid-mask pointer-events-none absolute inset-x-0 top-0 -z-10 h-[780px] opacity-60" />

      <div className="mx-auto grid max-w-[1440px] items-center gap-16 px-4 sm:px-6 lg:grid-cols-[.82fr_1.18fr] lg:gap-12 lg:px-10 xl:gap-20">
        <div className="relative z-10 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200 sm:text-[11px]">
            <Sparkles className="size-3" aria-hidden="true" />{t('landing.hero.eyebrow')}
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.72, delay: 0.08, ease: [0.22, 1, 0.36, 1] }} className="mt-7 text-[clamp(3.1rem,5vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.058em] text-white">
            {t('landing.hero.titleBefore')} <span className="landing-gradient-text">{t('landing.hero.titleAccent')}</span><br />{t('landing.hero.titleAfter')}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18 }} className="mt-7 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{t('landing.hero.support')}</motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.28 }} className="mt-4 max-w-xl text-sm leading-6 text-slate-500 sm:text-[15px]">{t('landing.hero.description')}</motion.p>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.34 }} className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href="#lead-generation" className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 shadow-[0_14px_45px_rgba(255,255,255,.12)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('landing.hero.primary')}<ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" /></a>
            <a href="#showcase" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.11] bg-white/[0.04] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><Play className="size-3.5 fill-current" />{t('landing.hero.secondary')}</a>
            <AuthAwareLink href="/dashboard" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{t('landing.hero.portal')}<ArrowUpRight className="size-4" /></AuthAwareLink>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.18, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-3xl lg:mx-0">
          <motion.div style={{ y: previewY }} className="relative z-10 [transform:perspective(1400px)_rotateY(-4deg)_rotateX(2deg)] rtl:[transform:perspective(1400px)_rotateY(4deg)_rotateX(2deg)]">
            <DashboardVisual className="ring-1 ring-blue-300/[0.06]" />
          </motion.div>
          <motion.div style={{ y: signalY }} className="pointer-events-none absolute inset-0 z-20 hidden md:block">
            {signals.map((signal, index) => (
              <motion.div key={signal.label} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.75 + index * 0.08, duration: 0.45 }} className={`absolute ${signal.pos} min-w-40 rounded-xl border border-white/[0.1] bg-[#090f1c]/90 p-3 shadow-2xl backdrop-blur-xl`}>
                <div className="flex items-center justify-between gap-3"><span className={`text-sm font-semibold ${signal.color}`}>{signal.value}</span><span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[6px] font-bold tracking-widest text-slate-600">DEMO</span></div>
                <p className="mt-1 text-[9px] text-slate-400">{signal.label}</p>
              </motion.div>
            ))}
          </motion.div>
          <div className="pointer-events-none absolute -inset-16 -z-10 bg-[radial-gradient(circle,rgba(59,130,246,.18),transparent_62%)] blur-2xl" />
        </motion.div>
      </div>
    </section>
  );
}
