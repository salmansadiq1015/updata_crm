'use client';

import { BarChart3, CheckCircle2, ClipboardCheck, FileText, UserPlus, Wrench, MessageSquare, Radar, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { Reveal, SectionIntro } from './motion-primitives';

export function WorkflowTimeline() {
  const { t } = useLanguage();
  const stages = [
    ['discover', Radar, 'Lead Generation'], ['capture', UserPlus, 'CRM'], ['qualify', Target, 'Leads'],
    ['communicate', MessageSquare, 'Chat'], ['sell', FileText, 'Quotes & Orders'], ['plan', ClipboardCheck, 'Projects'],
    ['execute', Wrench, 'Field Ops'], ['complete', CheckCircle2, 'Tasks'], ['analyze', BarChart3, 'Dashboard'],
  ];
  return (
    <section className="relative overflow-hidden bg-[#08101d] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionIntro eyebrow={t('landing.workflow.eyebrow')} title={t('landing.workflow.title')} description={t('landing.workflow.description')} />
        <Reveal className="mt-14">
          <div className="relative hidden lg:block">
            <div className="absolute start-5 end-5 top-[22px] h-px bg-white/[0.08]" />
            <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} className="absolute start-5 end-5 top-[22px] h-px origin-left bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-300 rtl:origin-right" />
            <ol className="relative grid grid-cols-9 gap-2">
              {stages.map(([key, Icon, module], index) => <motion.li key={key} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.07, duration: 0.42 }} className="text-center"><span className="mx-auto grid size-11 place-items-center rounded-full border border-white/[0.1] bg-[#0b1322] text-blue-300 shadow-[0_0_0_7px_#08101d]"><Icon className="size-4" /></span><p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">{t(`landing.workflow.${key}`)}</p><p className="mt-1 text-[8px] text-slate-600">{module}</p></motion.li>)}
            </ol>
          </div>
          <ol className="relative space-y-1 lg:hidden before:absolute before:bottom-5 before:start-[21px] before:top-5 before:w-px before:bg-gradient-to-b before:from-blue-700 before:via-blue-500 before:to-cyan-300">
            {stages.map(([key, Icon, module], index) => <li key={key} className="relative flex items-center gap-4 rounded-xl p-2"><span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.1] bg-[#0b1322] text-blue-300"><Icon className="size-4" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">{String(index + 1).padStart(2, '0')} · {t(`landing.workflow.${key}`)}</p><p className="mt-1 text-[10px] text-slate-600">{module}</p></div></li>)}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
