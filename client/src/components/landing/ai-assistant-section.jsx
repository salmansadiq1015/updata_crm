'use client';

import { CheckCircle2, Database, SearchCheck, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiVisual } from './landing-visuals';
import { Reveal, SectionIntro } from './motion-primitives';

export function AIAssistantSection() {
  const { t } = useLanguage();
  const principles = [
    [Database, 'Business context'], [SearchCheck, 'Find and summarize'], [CheckCircle2, 'Prepare the next step'], [ShieldCheck, 'Human review'],
  ];
  return (
    <section id="ai" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div className="pointer-events-none absolute start-[32%] top-[8%] size-[640px] rounded-full bg-cyan-600/[0.07] blur-[150px]" />
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr] lg:items-center xl:gap-20">
          <div>
            <SectionIntro eyebrow={t('landing.ai.eyebrow')} title={t('landing.ai.title')} description={t('landing.ai.description')} />
            <Reveal delay={0.08} className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {principles.map(([Icon, label]) => <div key={label} className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"><Icon className="size-3.5 text-cyan-300" /><span className="text-[11px] text-slate-400">{label}</span></div>)}
            </Reveal>
          </div>
          <Reveal delay={0.1} className="relative"><AiVisual className="min-h-[460px]" /><div className="pointer-events-none absolute -inset-10 -z-10 bg-[radial-gradient(circle,rgba(14,165,233,.13),transparent_65%)] blur-2xl" /></Reveal>
        </div>
      </div>
    </section>
  );
}
