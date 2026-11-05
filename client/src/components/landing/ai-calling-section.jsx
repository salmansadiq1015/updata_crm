'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FileAudio, Check, CircleUserRound, MessageSquareText, PhoneCall, Bot } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Reveal, SectionIntro, DemoLabel } from './motion-primitives';

const bars = [14, 24, 18, 36, 46, 28, 38, 20, 44, 32, 18, 40, 26, 46, 34, 20, 30, 42, 22, 16];

export function AICallingSection() {
  const { t } = useLanguage();
  return (
    <section id="ai-calling" className="relative overflow-hidden border-y border-white/[.07] bg-[#0b1220] py-20 sm:py-28">
      <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionIntro eyebrow={t('experience.calling.eyebrow')} title={t('experience.calling.title')} description={t('experience.calling.description')} />
            <div className="mt-9 space-y-6">
              {[[CircleUserRound, 'agents'], [FileAudio, 'context'], [MessageSquareText, 'follow']].map(([Icon, key]) => (
                <Reveal key={key} className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-200/10 bg-blue-200/5 text-blue-200"><Icon aria-hidden="true" className="size-4" /></span>
                  <div><h3 className="text-sm font-semibold text-slate-100">{t(`experience.calling.${key}`)}</h3><p className="mt-1.5 max-w-lg text-sm leading-6 text-slate-400">{t(`experience.calling.${key}Body`)}</p></div>
                </Reveal>
              ))}
            </div>
            <Link href="/calling-engine" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200/20 px-4 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-200/5"><PhoneCall aria-hidden="true" className="size-4" />{t('experience.calling.nav')}</Link>
          </div>
          <Reveal className="relative min-w-0">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#080e1a] p-4 sm:p-6">
              <div className="relative -mx-4 -mt-4 aspect-[2/1] sm:-mx-6 sm:-mt-6">
                <Image src="/landing/ai-voice-sculpture-1280.webp" alt="" fill sizes="(min-width: 1024px) 45vw, 90vw" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080e1a] via-transparent to-transparent" />
                <DemoLabel className="absolute start-4 top-4 text-slate-300">{t('experience.preview')}</DemoLabel>
              </div>
              <div className="relative -mt-8 flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-blue-200/15 bg-[#142444] text-blue-200"><Bot aria-hidden="true" className="size-5" /></span>
                <div><h3 className="text-sm font-semibold text-white">{t('experience.agent.name')}</h3><p className="mt-1 text-xs text-slate-400">{t('experience.agent.role')}</p></div>
              </div>
              <div className="mt-6 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-5">
                <p className="flex items-center gap-2 text-xs text-blue-200"><span aria-hidden="true" className="size-1.5 rounded-full bg-blue-300" />{t('experience.agent.status')}</p>
                <div className="voice-bars my-4 justify-center" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ '--bar-height': `${height}px`, '--bar-delay': `${index * -.13}s` }} />)}</div>
                <p className="border-t border-white/[.07] pt-4 text-xs font-medium text-slate-300">{t('experience.agent.transcript')}</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">{t('experience.agent.question')}</p>
                <p className="ms-5 mt-3 rounded-xl border border-white/[.06] bg-white/[.04] p-3 text-sm leading-6 text-slate-400">{t('experience.agent.answer')}</p>
              </div>
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-300/15 bg-emerald-300/[.04] p-4">
                <Check aria-hidden="true" className="mt-.5 size-4 shrink-0 text-emerald-300" /><div><p className="text-sm font-medium text-emerald-200">{t('experience.agent.result')}</p><p className="mt-1 text-xs text-slate-400">{t('experience.agent.followup')}</p></div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
