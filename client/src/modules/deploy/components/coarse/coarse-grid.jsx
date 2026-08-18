'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CoarseCell } from './coarse-cell';
import { EmployeeAvatarRow } from '../shared/employee-avatar-row';
import { rowAverage, isRowOverAllocated } from '../../utils/coarse-totals';
import { getAllocationTier } from '../../constants/deploy-constants';
import { Layers } from 'lucide-react';

const NAME_COL = 'w-[210px] shrink-0';
const SUM_COL = 'w-[84px] shrink-0';

function HeatBar({ percent }) {
  const tier = getAllocationTier(percent) || { bg: 'bg-muted-foreground/20' };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', tier.bg)}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export function CoarseGrid({
  viewMode, weeks, rows, columnAvgs, currentWeek,
  dragFill, selectedCell,
  onCellClick, onCellDoubleClick, onSetPercent, onClear, onBulkRow,
}) {
  const { t } = useLanguage();
  const isProjectView = viewMode === 'PROJECT_CENTRIC';

  return (
    <div className="overflow-auto rounded-2xl border border-border/60 bg-card/40 shadow-sm">
      <div className="min-w-max">
        {/* Header row */}
        <div className="sticky top-0 z-20 flex border-b border-border/60 bg-muted/50 backdrop-blur-sm">
          <div className={cn(NAME_COL, 'sticky left-0 z-10 border-r border-border/60 bg-muted/50 px-3 py-2.5 text-xs font-semibold')}>
            {isProjectView ? t('deploy.coarse.project', 'Projekt') : t('deploy.coarse.employee', 'Mitarbeiter')}
          </div>
          {weeks.map((week) => (
            <div
              key={week}
              className={cn(
                'min-w-[58px] flex-1 border-r border-border/40 py-2.5 text-center text-[11px] font-semibold last:border-r-0',
                week === currentWeek ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
              )}
            >
              KW {week}
            </div>
          ))}
          <div className={cn(SUM_COL, 'border-l border-border/60 py-2.5 text-center text-[11px] font-semibold text-muted-foreground')}>
            Ø
          </div>
        </div>

        {/* Body rows */}
        {rows.map((row) => {
          const avg = rowAverage(row, weeks);
          const over = isRowOverAllocated(row, weeks);
          return (
            <div key={row.id} className="group flex border-b border-border/40 last:border-b-0 hover:bg-muted/20">
              <div className={cn(
                NAME_COL,
                'sticky left-0 z-10 flex flex-col justify-center gap-1.5 border-r border-border/60 bg-card px-3 py-2 transition-colors group-hover:bg-muted/30',
              )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {over && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/20" />
                      </TooltipTrigger>
                      <TooltipContent>{t('deploy.coarse.overAllocated', 'Überbelegt')}</TooltipContent>
                    </Tooltip>
                  )}
                  {isProjectView
                    ? <span className="truncate text-xs font-medium">{row.name}</span>
                    : <EmployeeAvatarRow name={row.name} />}
                </div>
                {/* Explicit, always-visible entry point to multi-week planning —
                    it used to be a hover-only icon that users never found. */}
                {!isProjectView && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-fit gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => onBulkRow(row.id)}
                    aria-label={t('deploy.coarse.bulkTitle', 'Mehrwochen-Zuteilung')}
                  >
                    <Layers className="h-3 w-3 shrink-0" />
                    {t('deploy.coarse.bulkTitle', 'Mehrwochen-Zuteilung')}
                  </Button>
                )}
              </div>

              {weeks.map((week) => {
                const isCellSelected = selectedCell?.rowId === row.id && selectedCell?.week === week;
                return (
                  <div key={week} className={cn('min-w-[58px] flex-1', week === currentWeek && 'bg-primary/[0.04]')}>
                    <CoarseCell
                      allocation={row.weekMap[week] || []}
                      assignmentPercent={row.assignmentMap?.[week] || 0}
                      projectName={isProjectView ? row.name : undefined}
                      isCurrentWeek={week === currentWeek}
                      isSelected={isCellSelected}
                      isDragSource={dragFill.isSource(row.id, week)}
                      isDropTarget={dragFill.isDropTarget(row.id, week)}
                      onMouseDown={() => dragFill.start(row.id, week, row.weekMap[week] || [])}
                      onMouseEnter={() => dragFill.extend(row.id, week)}
                      onClick={() => {
                        if (dragFill.consumeClickSuppression()) return;
                        onCellClick(row.id, week, row.weekMap[week] || []);
                      }}
                      onDoubleClick={() => {
                        onCellDoubleClick?.(row.id, week, row.weekMap[week] || []);
                      }}
                      onSetPercent={(percent) => onSetPercent(row.weekMap[week] || [], percent)}
                      onClear={() => onClear(row.weekMap[week] || [])}
                    />
                  </div>
                );
              })}

              <div className={cn(SUM_COL, 'flex flex-col justify-center gap-1 border-l border-border/60 px-2.5 py-2')}>
                <span className={cn(
                  'text-center text-xs font-bold tabular-nums',
                  over ? 'text-red-500' : 'text-foreground',
                )}
                >
                  {avg}%
                </span>
                <HeatBar percent={avg} />
              </div>
            </div>
          );
        })}

        {/* Footer: team load + free capacity per week */}
        <div className="sticky bottom-0 z-10 border-t border-border/60 bg-muted/40 backdrop-blur-sm">
          {/* Team load per week */}
          <div className="flex">
            <div className={cn(NAME_COL, 'sticky left-0 z-10 border-r border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground')}>
              {t('deploy.coarse.teamLoad', 'Team-Auslastung')}
            </div>
            {weeks.map((week) => {
              const value = columnAvgs[week] || 0;
              const tier = getAllocationTier(value);
              return (
                <div
                  key={week}
                  className={cn(
                    'min-w-[58px] flex-1 border-r border-border/40 py-2 text-center text-[11px] font-bold tabular-nums last:border-r-0',
                    value > 100 ? 'text-red-500' : value > 0 ? 'text-foreground' : 'text-muted-foreground/50',
                    week === currentWeek && 'bg-primary/10',
                  )}
                >
                  <span className={cn('inline-block rounded-md px-1.5 py-0.5', tier?.bg, tier?.text)}>
                    {value}%
                  </span>
                </div>
              );
            })}
            <div className={cn(SUM_COL, 'border-l border-border/60')} />
          </div>
          {/* Free capacity per week — the complement, so a booked week visibly
              lowers the number (module 08 client feedback). */}
          <div className="flex border-t border-border/40">
            <div className={cn(NAME_COL, 'sticky left-0 z-10 border-r border-border/60 bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70')}>
              {t('deploy.coarse.freeCapacity', 'Freie Kapazität')}
            </div>
            {weeks.map((week) => {
              const free = Math.max(0, 100 - (columnAvgs[week] || 0));
              return (
                <div
                  key={week}
                  className={cn(
                    'min-w-[58px] flex-1 border-r border-border/40 py-1.5 text-center text-[11px] tabular-nums last:border-r-0',
                    free === 0 ? 'font-bold text-red-500' : free < 50 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
                    week === currentWeek && 'bg-primary/10',
                  )}
                >
                  {free}%
                </div>
              );
            })}
            <div className={cn(SUM_COL, 'border-l border-border/60')} />
          </div>
        </div>
      </div>
    </div>
  );
}
