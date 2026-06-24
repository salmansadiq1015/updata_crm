'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CoarseLegend } from './coarse-legend';
import { ChevronLeft, ChevronRight, Search, Users, FolderKanban, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

function ViewToggle({ value, onChange }) {
  const { t } = useLanguage();
  const options = [
    { key: 'EMPLOYEE_CENTRIC', icon: Users, label: t('deploy.coarse.employeeView', 'Mitarbeitersicht') },
    { key: 'PROJECT_CENTRIC', icon: FolderKanban, label: t('deploy.coarse.projectView', 'Projektsicht') },
  ];
  return (
    <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/40 p-0.5">
      {options.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
            value === key
              ? 'bg-background text-foreground shadow-sm ring-1 ring-border/60'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function CoarseHeader({
  year, weekFrom, weekTo, viewMode,
  search, onSearchChange,
  overAllocatedOnly, onOverAllocatedOnlyChange,
  onYearChange, onWeekFromChange, onWeekToChange, onViewModeChange,
  onPrevRange, onNextRange,
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('deploy.coarse.title', 'Grobplanung (OF-Bau)')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('deploy.coarse.subtitle', 'Wochenweise Kapazitätsplanung über Mitarbeiter und Projekte.')}
          </p>
        </div>
        <ViewToggle value={viewMode} onChange={onViewModeChange} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/50 px-3 py-2.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onPrevRange}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/70 px-2.5 py-1">
            <Input
              type="number"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="h-7 w-[68px] border-0 bg-transparent px-1 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
              min={2020}
              max={2040}
            />
            <span className="text-[11px] font-medium uppercase text-muted-foreground">KW</span>
            <Input
              type="number"
              value={weekFrom}
              onChange={(e) => onWeekFromChange(Number(e.target.value))}
              className="h-7 w-12 border-0 bg-transparent px-1 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
              min={1}
              max={53}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              value={weekTo}
              onChange={(e) => onWeekToChange(Number(e.target.value))}
              className="h-7 w-12 border-0 bg-transparent px-1 text-center text-sm font-semibold shadow-none focus-visible:ring-0"
              min={1}
              max={53}
            />
          </div>

          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={onNextRange}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={viewMode === 'PROJECT_CENTRIC'
                ? t('deploy.coarse.searchProjectRows', 'Projekte filtern...')
                : t('deploy.coarse.searchEmployeeRows', 'Mitarbeiter filtern...')}
              className="h-9 rounded-xl bg-background/70 pl-9 pr-8 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('deploy.common.clear', 'Löschen')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-1.5">
            <Switch checked={overAllocatedOnly} onCheckedChange={onOverAllocatedOnlyChange} />
            <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
              {t('deploy.coarse.overAllocatedOnly', 'Nur überbelegte')}
            </span>
          </label>
        </div>
      </div>

      <CoarseLegend />
    </div>
  );
}
