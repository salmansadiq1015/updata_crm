'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ALLOCATION_PERCENT_COLORS, ALLOCATION_OVER_COLOR } from '../../constants/deploy-constants';

export function CoarseLegend() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <span className="font-medium text-muted-foreground">{t('deploy.coarse.allocation', 'Zuteilung')}:</span>
      <div className="flex items-center gap-1.5">
        {Object.entries(ALLOCATION_PERCENT_COLORS).map(([percent, colors]) => (
          <div key={percent} className="flex items-center gap-1.5">
            <div className={cn('h-3.5 w-6 rounded-md', colors.bg)} />
            <span className="text-muted-foreground">{percent}%</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className={cn('h-3.5 w-6 rounded-md', ALLOCATION_OVER_COLOR.bg)} />
          <span className="text-muted-foreground">{t('deploy.coarse.over', '>100%')}</span>
        </div>
      </div>
      <span className="ml-auto hidden text-[11px] text-muted-foreground/70 sm:inline">
        {t('deploy.coarse.hint', 'Klicken zum Wechseln · Ziehen zum Füllen · ▾ für Auswahl')}
      </span>
    </div>
  );
}
