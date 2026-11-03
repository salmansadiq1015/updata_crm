'use client';

import { Building2, FileText, FolderKanban, MessageSquare, PhoneCall, Send, UserPlus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { DemoLabel, Reveal, SectionIntro } from './motion-primitives';

export function CommunicationSection() {
  const { t } = useLanguage();
  const chain = [['customer', Building2], ['conversation', MessageSquare], ['lead', UserPlus], ['quote', FileText], ['project', FolderKanban], ['followup', PhoneCall]];
  return (
    <section className="relative overflow-hidden bg-[#08101d] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionIntro align="center" eyebrow={t('landing.communication.eyebrow')} title={t('landing.communication.title')} description={t('landing.communication.description')} />
        <Reveal className="mx-auto mt-12 max-w-6xl">
          <div className="relative grid overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#090f1b] pb-10 lg:grid-cols-[1fr_.85fr] lg:pb-0">
            <div className="border-b border-white/[0.07] p-5 sm:p-8 lg:border-b-0 lg:border-e">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 text-xs font-bold text-white">SK</span><div><p className="text-xs font-semibold text-white">{t('experience.preview.project')}</p><p className="mt-0.5 text-[8px] text-emerald-400">{t('experience.preview.online')}</p></div></div>
              <div className="mt-8 space-y-4"><div className="max-w-[82%] rounded-2xl rounded-es-md border border-white/[0.07] bg-white/[0.035] p-3 text-[10px] leading-5 text-slate-300">{t('landing.communication.message1')}<p className="mt-1 text-[7px] text-slate-600">09:24 · Sarah</p></div><div className="ms-auto max-w-[82%] rounded-2xl rounded-ee-md bg-blue-500 p-3 text-[10px] leading-5 text-white">{t('landing.communication.message2')}<p className="mt-1 text-[7px] text-blue-200">{t('experience.preview.you')}</p></div></div>
              <div className="mt-6 flex h-10 items-center rounded-xl border border-white/[0.08] bg-black/15 px-3 text-[9px] text-slate-600">{t('experience.preview.write')}<span className="ms-auto grid size-6 place-items-center rounded-md bg-blue-500 text-white"><Send className="size-3 rtl:rotate-180" /></span></div>
            </div>
            <div className="p-5 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t('experience.preview.context')}</p>
              <div className="mt-5 space-y-1.5">
                {chain.map(([key, Icon], index) => <div key={key} className="relative flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"><span className="grid size-7 place-items-center rounded-lg bg-blue-400/[0.08] text-blue-300"><Icon className="size-3.5" /></span><span className="text-[11px] font-medium text-slate-300">{t(`landing.communication.${key}`)}</span>{index < chain.length - 1 ? <span className="absolute -bottom-2 start-[25px] z-10 h-2 w-px bg-blue-400/30" /> : null}<span className="ms-auto size-1.5 rounded-full bg-emerald-400" /></div>)}
              </div>
            </div>
            <DemoLabel className="absolute bottom-3 end-3">{t('landing.showcase.demo')}</DemoLabel>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
