'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ALLOCATION_PERCENT_COLORS } from '../../constants/deploy-constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const CoarseCell = memo(function CoarseCell({ allocation, projectName, onClick }) {
  const { t } = useLanguage();
  const allocations = Array.isArray(allocation) ? allocation : [allocation].filter(Boolean);
  const percent = allocations.reduce((total, item) => total + (item?.allocationPercent || 0), 0);
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
            'w-full h-full min-h-[36px] border-r border-b flex flex-col items-center justify-center gap-0.5 px-1',
            'text-[10px] font-bold transition-colors hover:brightness-110',
            colors?.bg || 'bg-slate-200 dark:bg-slate-800',
            colors?.text || 'text-slate-800 dark:text-slate-100'
          )}
        >
          <span>{percent}%</span>
          {allocations.length > 1 && (
            <span className="text-[9px] font-medium opacity-80">{allocations.length}x</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">{projectName || t('deploy.coarse.project', 'Projekt')}</p>
        <div className="space-y-1 mt-1">
          {allocations.map((item) => {
            const employeeName = item.employeeId?.firstName
              ? `${item.employeeId.firstName} ${item.employeeId.lastName}`
              : item.employeeId;
            const itemProjectName = item.projectId?.name || item.projectId;
            return (
              <div key={item._id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{item.allocationPercent}%</span>
                {' '}
                {projectName ? employeeName : itemProjectName}
              </div>
            );
          })}
        </div>
        {allocations.some((item) => item.notes) && (
          <p className="text-muted-foreground mt-1">{allocations.find((item) => item.notes)?.notes}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
});
