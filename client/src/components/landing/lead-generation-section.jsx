'use client';

import { ArrowRight, Check, MapPin, Radar, Search, Sparkles, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { LeadGenerationVisual } from './landing-visuals';
import { Reveal, SectionIntro } from './motion-primitives';

export function LeadGenerationSection() {
  const { t } = useLanguage();
  const stages = [
    ['location', MapPin], ['area', Radar], ['type', Search], ['analyze', Sparkles],
    ['discover', Radar], ['review', Check], ['dedupe', Check], ['import', Upload],
  ];

  return (
    <section id="lead-generation" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
      <div className="pointer-events-none absolute start-[-15%] top-[20%] size-[520px] rounded-full bg-blue-600/[0.08] blur-[130px]" />
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_.72fr]">
          <SectionIntro eyebrow={t('landing.leadgen.eyebrow')} title={t('landing.leadgen.title')} description={t('landing.leadgen.description')} />
          <Reveal delay={0.1} className="lg:justify-self-end lg:max-w-md"><p className="border-s border-blue-400/40 ps-5 text-sm leading-6 text-slate-400">{t('landing.leadgen.proof')}</p></Reveal>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[.58fr_1.42fr] lg:items-center xl:gap-14">
          <Reveal className="relative">
            <div className="absolute bottom-5 start-[17px] top-5 w-px bg-white/[0.08]" aria-hidden="true" />
            <ol className="relative space-y-1">
              {stages.map(([key, Icon], index) => (
                <motion.li key={key} initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.8 }} transition={{ duration: 0.38, delay: index * 0.055 }} className="group flex items-center gap-4 rounded-xl px-1 py-2.5">
                  <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-[#0a1120] text-slate-500 transition-colors group-hover:border-blue-400/40 group-hover:text-blue-300"><Icon className="size-3.5" /></span>
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">{String(index + 1).padStart(2, '0')}</p><p className="mt-0.5 text-sm font-medium text-slate-300 transition-colors group-hover:text-white">{t(`landing.leadgen.${key}`)}</p></div>
                  {index < stages.length - 1 ? <ArrowRight className="size-3.5 text-slate-700 rtl:rotate-180" aria-hidden="true" /> : <Check className="size-3.5 text-emerald-400" aria-hidden="true" />}
                </motion.li>
              ))}
            </ol>
          </Reveal>
          <Reveal delay={0.12} className="relative min-w-0">
            <LeadGenerationVisual className="min-h-[520px]" />
            <div className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle_at_62%_48%,rgba(59,130,246,.15),transparent_62%)] blur-2xl" />
          </Reveal>
        </div>

        <Reveal delay={0.12} className="mt-10 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018] px-4 py-5 sm:px-7">
          <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto" aria-label="Lead discovery workflow">
            {['location', 'area', 'discover', 'review', 'dedupe', 'import'].map((key, index, items) => <div key={key} className="flex shrink-0 items-center gap-2"><span className="rounded-lg border border-white/[0.08] bg-[#0b1322] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{t(`landing.leadgen.${key}`)}</span>{index < items.length - 1 ? <ArrowRight className="size-3.5 text-blue-400/50 rtl:rotate-180" /> : null}</div>)}
            <span className="ms-auto hidden shrink-0 items-center gap-2 rounded-full bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-semibold text-emerald-300 xl:flex"><Check className="size-3" />CRM</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
