'use client';

import { useState } from 'react';
import {
  Bell, Bot, Boxes, CalendarDays, CarFront, CheckSquare2, ContactRound, FileText,
  Files, FolderKanban, LayoutDashboard, MapPinned, MessageSquare, Radar, Receipt,
  Smartphone, UserPlus, Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Reveal, SectionIntro } from './motion-primitives';

const modules = [
  ['dashboard', LayoutDashboard, 'blue'], ['chat', MessageSquare, 'sky'], ['calendar', CalendarDays, 'amber'],
  ['tasks', CheckSquare2, 'cyan'], ['notifications', Bell, 'emerald'], ['ai', Bot, 'sky'],
  ['employees', Users, 'blue'], ['objects', MapPinned, 'amber'], ['customers', ContactRound, 'sky'],
  ['address', Users, 'cyan'], ['leadgen', Radar, 'blue'], ['leads', UserPlus, 'sky'],
  ['quotes', FileText, 'amber'], ['projects', FolderKanban, 'blue'], ['accounting', Receipt, 'emerald'],
  ['fieldops', Smartphone, 'orange'], ['catalog', Boxes, 'cyan'], ['documents', Files, 'blue'], ['vehicles', CarFront, 'amber'],
];

const colorClass = {
  blue: 'bg-blue-400/10 text-blue-300 ring-blue-400/20', sky: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
  amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/20', cyan: 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20',
  emerald: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20', orange: 'bg-orange-400/10 text-orange-300 ring-orange-400/20',
};

function ModuleButton({ item, selected, onSelect }) {
  const { t } = useLanguage();
  const [key, Icon, color] = item;
  return (
    <button type="button" onMouseEnter={() => onSelect(key)} onFocus={() => onSelect(key)} onClick={() => onSelect(key)} aria-pressed={selected} className={cn('group flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400', selected ? 'border-blue-400/30 bg-blue-400/[0.07] shadow-[0_8px_30px_rgba(37,99,235,.08)]' : 'border-white/[0.065] bg-white/[0.018] hover:border-white/[0.13] hover:bg-white/[0.035]')}>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg ring-1', colorClass[color])}><Icon className="size-3.5" /></span>
      <span className={cn('text-[11px] font-medium', selected ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')}>{t(`landing.ecosystem.${key}`)}</span>
      <span className={cn('ms-auto size-1.5 rounded-full transition-colors', selected ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,.8)]' : 'bg-white/[0.12]')} />
    </button>
  );
}

export function FeatureEcosystem() {
  const { t } = useLanguage();
  const [selected, setSelected] = useState('leadgen');
  const selectedItem = modules.find(([key]) => key === selected) ?? modules[0];
  const SelectedIcon = selectedItem[1];
  const left = modules.slice(0, 10);
  const right = modules.slice(10);

  return (
    <section id="features" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div className="landing-grid-mask pointer-events-none absolute inset-0 opacity-30" />
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionIntro align="center" eyebrow={t('landing.ecosystem.eyebrow')} title={t('landing.ecosystem.title')} description={t('landing.ecosystem.description')} />
        <Reveal className="mt-14">
          <div className="relative grid gap-5 lg:grid-cols-[1fr_300px_1fr] lg:items-center xl:gap-10">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {left.map((item) => <ModuleButton key={item[0]} item={item} selected={selected === item[0]} onSelect={setSelected} />)}
            </div>
            <div className="relative order-first mx-auto w-full max-w-sm lg:order-none">
              <div className="pointer-events-none absolute inset-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-blue-400/15" />
              <motion.div key={selected} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.24 }} className="relative z-10 overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#090f1b] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,.38)]">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-[0_16px_45px_rgba(59,130,246,.28)]"><SelectedIcon className="size-7" /></div>
                <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">{t('landing.ecosystem.selected')}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{t(`landing.ecosystem.${selected}`)}</h3>
                <p className="mt-3 min-h-12 text-xs leading-5 text-slate-500">{t(`landing.ecosystem.desc.${selected}`)}</p>
                <div className="mt-5 flex items-center justify-center gap-2"><span className="h-px w-9 bg-gradient-to-r from-transparent to-blue-400/60" /><span className="text-[10px] font-black tracking-[0.22em] text-white">UPDATA</span><span className="h-px w-9 bg-gradient-to-l from-transparent to-cyan-400/60" /></div>
              </motion.div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {right.map((item) => <ModuleButton key={item[0]} item={item} selected={selected === item[0]} onSelect={setSelected} />)}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
