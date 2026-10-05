'use client';

import { Bell, CalendarDays, CheckSquare2, MessageSquare, UserRound, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Reveal, SectionIntro } from './motion-primitives';

export function TeamWorkspaceSection() {
  const { t } = useLanguage();
  const modules = [['people', Users, 'blue'], ['chat', MessageSquare, 'sky'], ['calendar', CalendarDays, 'amber'], ['notifications', Bell, 'emerald']];
  const activity = [['09:12', 'a1', CheckSquare2], ['09:18', 'a2', UserRound], ['09:27', 'a3', CheckSquare2], ['09:41', 'a4', CheckSquare2]];

  return (
    <section className="relative overflow-hidden bg-[#08101d] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center xl:gap-20">
          <div>
            <SectionIntro eyebrow={t('landing.team.eyebrow')} title={t('landing.team.title')} description={t('landing.team.description')} />
            <Reveal delay={0.08} className="mt-8 grid grid-cols-2 gap-2">
              {modules.map(([key, Icon, color]) => <div key={key} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><span className={cn('grid size-8 place-items-center rounded-lg', color === 'blue' ? 'bg-blue-400/10 text-blue-300' : color === 'sky' ? 'bg-sky-400/10 text-sky-300' : color === 'amber' ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300')}><Icon className="size-4" /></span><span className="text-[11px] font-medium text-slate-300">{t(`landing.team.${key}`)}</span></div>)}
            </Reveal>
          </div>

          <Reveal delay={0.1} className="relative">
            <div className="grid overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#090f1b] shadow-[0_30px_100px_rgba(0,0,0,.35)] sm:grid-cols-[.72fr_1.28fr]">
              <div className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-e sm:p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Team workspace</p>
                <div className="relative mt-8 grid place-items-center py-6">
                  <div className="absolute size-44 rounded-full border border-dashed border-blue-400/20" />
                  <div className="absolute size-28 rounded-full border border-cyan-400/15" />
                  <span className="relative z-10 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-[0_16px_45px_rgba(59,130,246,.3)]"><Users className="size-7" /></span>
                  {[
                    ['top-0 start-1/2 -translate-x-1/2', 'SK', 'bg-cyan-500'],
                    ['end-2 top-1/2 -translate-y-1/2', 'AM', 'bg-blue-600'],
                    ['bottom-0 start-1/2 -translate-x-1/2', 'LW', 'bg-emerald-500'],
                    ['start-2 top-1/2 -translate-y-1/2', 'MJ', 'bg-amber-500'],
                  ].map(([position, initials, color]) => <motion.span key={initials} initial={{ opacity: 0, scale: 0.7 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className={`absolute ${position} z-10 grid size-9 place-items-center rounded-full border-2 border-[#090f1b] ${color} text-[8px] font-bold text-white shadow-lg`}>{initials}</motion.span>)}
                </div>
                <div className="mt-8 grid grid-cols-3 gap-1.5">{[['8', 'Team'], ['12', 'Tasks'], ['3', 'Meetings']].map(([value, label]) => <div key={label} className="rounded-lg bg-white/[0.03] p-2 text-center"><p className="text-sm font-semibold text-white">{value}</p><p className="text-[6px] uppercase tracking-wider text-slate-600">{label}</p></div>)}</div>
              </div>
              <div className="p-5 sm:p-6">
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-white">{t('landing.team.activity')}</p><span className="flex items-center gap-1.5 text-[7px] font-medium text-cyan-300"><span className="size-1.5 rounded-full bg-cyan-400" />{t('landing.showcase.demo')}</span></div>
                <div className="relative mt-6 space-y-5 before:absolute before:bottom-3 before:start-[17px] before:top-3 before:w-px before:bg-white/[0.08]">
                  {activity.map(([time, key, Icon], index) => <motion.div key={key} initial={{ opacity: 0, x: 15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: index * 0.1 }} className="relative flex items-center gap-3"><span className={cn('relative z-10 grid size-9 place-items-center rounded-full border border-white/[0.08] bg-[#0d1524]', index === 2 ? 'text-amber-300' : index === 3 ? 'text-emerald-300' : 'text-blue-300')}><Icon className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium text-slate-300">{t(`landing.team.${key}`)}</p><p className="mt-0.5 text-[8px] text-slate-600">{time}</p></div></motion.div>)}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
