'use client';

import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { LeadsVisual } from './landing-visuals';
import { Reveal, SectionIntro } from './motion-primitives';

export function CrmSection() {
  const { t } = useLanguage();
  const stages = ['capture', 'qualify', 'assign', 'follow', 'convert'];
  const statuses = ['new', 'qualified', 'contacted', 'opportunity', 'won'];

  return (
    <section id="crm" className="relative overflow-hidden bg-[#08101d] py-24 sm:py-32">
      <div className="landing-diagonal-wash pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionIntro eyebrow={t('landing.crm.eyebrow')} title={t('landing.crm.title')} description={t('landing.crm.description')} />
        <Reveal className="mt-10">
          <div className="scrollbar-hide flex items-center overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#070d18]/70 px-3 py-3 sm:px-5">
            {stages.map((stage, index) => <div key={stage} className="flex shrink-0 flex-1 items-center"><div className="flex min-w-28 items-center gap-2.5 rounded-xl px-3 py-2"><span className="grid size-6 place-items-center rounded-full bg-blue-500/12 text-[9px] font-bold text-blue-300">{index + 1}</span><span className="text-[11px] font-semibold text-slate-300">{t(`landing.crm.flow.${stage}`)}</span></div>{index < stages.length - 1 ? <ArrowRight className="size-3.5 text-slate-700 rtl:rotate-180" /> : null}</div>)}
          </div>
        </Reveal>
        <div className="mt-10 grid gap-8 xl:grid-cols-[1.3fr_.7fr] xl:items-stretch">
          <Reveal><LeadsVisual className="h-full min-h-[430px]" /></Reveal>
          <Reveal delay={0.1} className="rounded-[22px] border border-white/[0.08] bg-[#090f1b] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Live pipeline model</p>
            <div className="mt-6 space-y-3">
              {statuses.map((status, index) => (
                <motion.div key={status} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08, duration: 0.4 }} className="relative flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                  <span className={`size-2 rounded-full ${index === 0 ? 'bg-blue-300' : index === 1 ? 'bg-sky-400' : index === 2 ? 'bg-cyan-400' : index === 3 ? 'bg-blue-500' : 'bg-cyan-300'}`} />
                  <span className="text-xs font-medium text-slate-300">{t(`landing.crm.status.${status}`)}</span>
                  <span className="ms-auto h-1.5 rounded-full bg-white/[0.06]" style={{ width: `${34 + index * 10}%` }}><span className="block h-full rounded-full bg-gradient-to-r from-blue-600/80 to-cyan-400/80" style={{ width: `${92 - index * 7}%` }} /></span>
                  {index < statuses.length - 1 ? <span className="absolute -bottom-3 start-[15px] h-3 w-px bg-white/[0.1]" /> : null}
                </motion.div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
