'use client';

import { ArrowDown, ArrowRight, CheckCircle2, FileText, FolderKanban, ListChecks, ReceiptText, UserPlus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { OperationsVisual } from './landing-visuals';
import { Reveal, SectionIntro } from './motion-primitives';

export function OperationsSection() {
  const { t } = useLanguage();
  const flow = [
    ['lead', UserPlus, 'text-sky-300 bg-sky-400/10'],
    ['quote', FileText, 'text-amber-300 bg-amber-400/10'],
    ['order', ReceiptText, 'text-orange-300 bg-orange-400/10'],
    ['project', FolderKanban, 'text-blue-300 bg-blue-400/10'],
    ['tasks', ListChecks, 'text-cyan-300 bg-cyan-400/10'],
    ['completion', CheckCircle2, 'text-emerald-300 bg-emerald-400/10'],
  ];
  return (
    <section id="operations" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div className="pointer-events-none absolute end-[-12%] top-[10%] size-[580px] rounded-full bg-blue-600/[0.07] blur-[140px]" />
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:items-center xl:gap-20">
          <div>
            <SectionIntro eyebrow={t('landing.operations.eyebrow')} title={t('landing.operations.title')} description={t('landing.operations.description')} />
            <Reveal delay={0.08} className="mt-9">
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                {flow.map(([key, Icon, color], index) => <li key={key} className="group relative flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"><span className={`grid size-8 place-items-center rounded-lg ${color}`}><Icon className="size-4" /></span><div><p className="text-[9px] text-slate-600">0{index + 1}</p><p className="text-xs font-medium text-slate-300">{t(`landing.operations.${key}`)}</p></div>{index < flow.length - 1 ? <ArrowRight className="ms-auto hidden size-3.5 text-slate-700 sm:block lg:hidden rtl:rotate-180" /> : null}</li>)}
              </ol>
            </Reveal>
          </div>
          <Reveal delay={0.1} className="relative"><OperationsVisual className="min-h-[440px]" /><div className="absolute -bottom-5 start-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/20 bg-[#08130f] px-4 py-2 text-[10px] font-semibold text-emerald-300 shadow-2xl md:flex"><ArrowDown className="size-3" />{t('landing.operations.completion')}</div></Reveal>
        </div>
      </div>
    </section>
  );
}
