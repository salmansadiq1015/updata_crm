'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiVisual, CustomerVisual, DashboardVisual, LeadGenerationVisual, LeadsVisual, OperationsVisual, TasksVisual } from './landing-visuals';
import { DemoLabel, Reveal, SectionIntro } from './motion-primitives';
import { cn } from '@/lib/utils';

const tabs = [
  ['overview', DashboardVisual], ['leads', LeadsVisual], ['leadgen', LeadGenerationVisual],
  ['customers', CustomerVisual], ['projects', OperationsVisual], ['ai', AiVisual], ['tasks', TasksVisual],
];

export function ProductShowcase() {
  const { t } = useLanguage();
  const [active, setActive] = useState('overview');
  const ActiveVisual = tabs.find(([key]) => key === active)?.[1] ?? DashboardVisual;

  return (
    <section id="showcase" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(to_top,rgba(37,99,235,.06),transparent)]" />
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionIntro eyebrow={t('landing.showcase.eyebrow')} title={t('landing.showcase.title')} description={t('landing.showcase.description')} />
          <Reveal delay={0.08} className="lg:max-w-md"><p className="text-sm leading-6 text-slate-400">{t(`landing.showcase.desc.${active}`)}</p></Reveal>
        </div>
        <Reveal className="mt-10">
          <div role="tablist" aria-label={t('landing.showcase.title')} className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-white/[0.08]">
            {tabs.map(([key]) => <button key={key} type="button" role="tab" aria-selected={active === key} aria-controls="showcase-panel" onClick={() => setActive(key)} className={cn('relative shrink-0 px-3 py-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 sm:px-4', active === key ? 'text-white' : 'text-slate-500 hover:text-slate-300')}>{t(`landing.showcase.${key}`)}{active === key ? <motion.span layoutId="showcase-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue-400" /> : null}</button>)}
          </div>
        </Reveal>
        <Reveal delay={0.08} className="relative mt-7 min-h-[440px] overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#090f1b] p-1.5 shadow-[0_35px_120px_rgba(0,0,0,.42)] sm:p-2">
          <AnimatePresence mode="wait">
            <motion.div id="showcase-panel" role="tabpanel" key={active} initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden rounded-[20px] border border-white/[0.06] bg-[#0a1020]">
              <ActiveVisual framed={false} />
            </motion.div>
          </AnimatePresence>
          <DemoLabel className="absolute bottom-4 end-4">{t('landing.showcase.demo')}</DemoLabel>
        </Reveal>
      </div>
    </section>
  );
}
