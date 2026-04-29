'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ConflictIndicator({ severity, description }) {
  const { t } = useLanguage();
  const isHard = severity === 'HARD';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'absolute top-0.5 right-0.5 h-2 w-2 rounded-full',
            isHard ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        <span className={cn('font-semibold', isHard ? 'text-red-500' : 'text-amber-500')}>
          {isHard ? t('deploy.conflicts.hardConflict', 'Harter Konflikt') : t('deploy.conflicts.softConflict', 'Weicher Konflikt')}
        </span>
        {description && <p className="mt-0.5">{description}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
