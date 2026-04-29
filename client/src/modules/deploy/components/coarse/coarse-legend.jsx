'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ALLOCATION_PERCENT_COLORS } from '../../constants/deploy-constants';

export function CoarseLegend() {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>{t('deploy.coarse.allocation', 'Zuteilung')}:</span>
      {Object.entries(ALLOCATION_PERCENT_COLORS).map(([percent, colors]) => (
        <div key={percent} className="flex items-center gap-1">
          <div className={cn('h-3 w-6 rounded-sm', colors.bg)} />
          <span>{percent}%</span>
        </div>
      ))}
    </div>
  );
}
