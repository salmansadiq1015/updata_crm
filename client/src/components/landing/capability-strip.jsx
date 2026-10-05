'use client';

import { Bot, BriefcaseBusiness, CheckSquare2, ContactRound, FolderKanban, MessageSquare, Radar, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function CapabilityStrip() {
  const { t } = useLanguage();
  const items = [
    ['crm', ContactRound], ['leadgen', Radar], ['ai', Bot], ['projects', FolderKanban],
    ['tasks', CheckSquare2], ['communication', MessageSquare], ['sales', BriefcaseBusiness], ['team', Users],
  ];
  return (
    <section aria-label={t('landing.capability.intro')} className="relative border-y border-white/[0.07] bg-[#080e1a]">
      <div className="mx-auto flex max-w-[1440px] flex-col px-4 sm:px-6 lg:flex-row lg:items-center lg:px-10">
        <p className="shrink-0 border-b border-white/[0.07] py-4 text-xs font-medium text-slate-400 lg:border-b-0 lg:border-e lg:pe-7">{t('landing.capability.intro')}</p>
        <div className="scrollbar-hide flex min-w-0 gap-1 overflow-x-auto py-3 lg:px-5">
          {items.map(([key, Icon]) => <div key={key} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/[0.035] hover:text-white"><Icon className="size-3.5 text-blue-400" />{t(`landing.capability.${key}`)}</div>)}
        </div>
      </div>
    </section>
  );
}
