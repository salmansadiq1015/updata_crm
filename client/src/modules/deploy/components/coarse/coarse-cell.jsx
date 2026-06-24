'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { getAllocationTier } from '../../constants/deploy-constants';
import { cellPercent } from '../../utils/coarse-totals';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Eraser } from 'lucide-react';

const PICKER_VALUES = [25, 50, 75, 100];

function AllocationPicker({ current, onPick, onClear, onClose }) {
  const { t } = useLanguage();
  return (
    <div className="w-36 p-1.5">
      <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('deploy.coarse.setAllocation', 'Zuteilung setzen')}
      </p>
      <div className="grid grid-cols-2 gap-1">
        {PICKER_VALUES.map((value) => {
          const tier = getAllocationTier(value);
          const active = value === current;
          return (
            <button
              key={value}
              type="button"
              onClick={() => { onPick(value); onClose?.(); }}
              className={cn(
                'flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition-all',
                tier?.bg, tier?.text,
                'hover:brightness-110 hover:ring-2 hover:ring-primary/40',
                active && 'ring-2 ring-primary ring-offset-1 ring-offset-popover',
              )}
            >
              {value}%
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => { onClear(); onClose?.(); }}
        className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Eraser className="h-3.5 w-3.5" />
        {t('deploy.coarse.clear', 'Entfernen')}
      </button>
    </div>
  );
}

export const CoarseCell = memo(function CoarseCell({
  allocation,
  projectName,
  inDragRange,
  isCurrentWeek,
  onClick,
  onMouseDown,
  onMouseEnter,
  onSetPercent,
  onClear,
}) {
  const { t } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const allocations = Array.isArray(allocation) ? allocation : [allocation].filter(Boolean);
  const percent = cellPercent(allocations);
  const tier = getAllocationTier(percent);
  const isSingle = allocations.length === 1;
  const isOver = percent > 100;

  const dragRing = inDragRange && 'ring-2 ring-inset ring-primary/70 z-10';

  if (!percent) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseEnter={onMouseEnter}
        className={cn(
          'group/cell relative w-full h-full min-h-[40px] border-r border-b transition-colors',
          'hover:bg-primary/5',
          isCurrentWeek && 'bg-primary/[0.03]',
          dragRing,
        )}
        aria-label={t('deploy.coarse.addAllocation', 'Zuteilung hinzufügen')}
      >
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-light text-muted-foreground/0 transition-colors group-hover/cell:text-muted-foreground/50">
          +
        </span>
      </button>
    );
  }

  return (
    <div className={cn('group/cell relative w-full h-full', dragRing)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseEnter={onMouseEnter}
            className={cn(
              'relative w-full h-full min-h-[40px] border-r border-b flex flex-col items-center justify-center gap-0.5 px-1',
              'text-[11px] font-bold transition-all hover:brightness-110',
              tier?.bg, tier?.text,
              isOver && 'ring-1 ring-inset ring-red-300/60',
            )}
          >
            <span className="tabular-nums leading-none">{percent}%</span>
            {allocations.length > 1 && (
              <span className="text-[8px] font-semibold uppercase tracking-wide opacity-75">
                {allocations.length}×
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-semibold">{projectName || t('deploy.coarse.project', 'Projekt')}</p>
          {isOver && (
            <p className="mt-0.5 font-medium text-red-300">
              {t('deploy.coarse.overAllocated', 'Überbelegt')} · {percent}%
            </p>
          )}
          <div className="mt-1 space-y-1">
            {allocations.map((item) => {
              const employeeName = item.employeeId?.firstName
                ? `${item.employeeId.firstName} ${item.employeeId.lastName}`
                : item.employeeId;
              const itemProjectName = item.projectId?.name || item.projectId;
              return (
                <div key={item._id} className="text-background/70">
                  <span className="font-semibold text-background">{item.allocationPercent}%</span>
                  {' '}
                  {projectName ? employeeName : itemProjectName}
                </div>
              );
            })}
          </div>
          {allocations.some((item) => item.notes) && (
            <p className="mt-1 text-background/70">{allocations.find((item) => item.notes)?.notes}</p>
          )}
        </TooltipContent>
      </Tooltip>

      {isSingle && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              className={cn(
                'absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-md',
                'bg-black/20 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/40',
                'group-hover/cell:flex',
                pickerOpen && 'flex',
              )}
              aria-label={t('deploy.coarse.setAllocation', 'Zuteilung setzen')}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-auto rounded-xl p-0 shadow-xl">
            <AllocationPicker
              current={percent}
              onPick={onSetPercent}
              onClear={onClear}
              onClose={() => setPickerOpen(false)}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
});
