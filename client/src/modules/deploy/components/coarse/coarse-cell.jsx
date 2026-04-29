'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ALLOCATION_PERCENT_COLORS } from '../../constants/deploy-constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CYCLE = [0, 25, 50, 75, 100];

export const CoarseCell = memo(function CoarseCell({ allocation, projectName, onClick }) {
  const { t } = useLanguage();
  const percent = allocation?.allocationPercent || 0;
  const colors = ALLOCATION_PERCENT_COLORS[percent];

  if (!percent) {
    return (
      <button
        onClick={onClick}
        className="w-full h-full min-h-[36px] border-r border-b hover:bg-muted/50 transition-colors"
        aria-label={t('deploy.coarse.addAllocation', 'Zuteilung hinzufügen')}
      />
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'w-full h-full min-h-[36px] border-r border-b flex items-center justify-center',
            'text-[10px] font-bold transition-colors hover:brightness-110',
            colors?.bg, colors?.text
          )}
        >
          {percent}%
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">{projectName || t('deploy.coarse.project', 'Projekt')}</p>
        <p className="text-muted-foreground">{percent}% {t('deploy.coarse.allocation', 'Zuteilung')}</p>
        {allocation?.notes && <p className="text-muted-foreground mt-0.5">{allocation.notes}</p>}
      </TooltipContent>
    </Tooltip>
  );
});
