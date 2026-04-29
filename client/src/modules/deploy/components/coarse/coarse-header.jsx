'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function CoarseHeader({
  year, weekFrom, weekTo, viewMode,
  onYearChange, onWeekFromChange, onWeekToChange, onViewModeChange,
  onPrevRange, onNextRange,
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-3 pb-4">
      <h1 className="text-xl font-semibold tracking-tight">
        {t('deploy.coarse.title', 'Grobplanung (OF-Bau)')}
      </h1>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrevRange}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="h-8 w-20 text-xs text-center"
              min={2020}
              max={2040}
            />
            <span className="text-xs text-muted-foreground">KW</span>
            <Input
              type="number"
              value={weekFrom}
              onChange={(e) => onWeekFromChange(Number(e.target.value))}
              className="h-8 w-16 text-xs text-center"
              min={1}
              max={53}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              value={weekTo}
              onChange={(e) => onWeekToChange(Number(e.target.value))}
              className="h-8 w-16 text-xs text-center"
              min={1}
              max={53}
            />
          </div>

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNextRange}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={viewMode} onValueChange={onViewModeChange}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EMPLOYEE_CENTRIC" className="text-xs">
              {t('deploy.coarse.employeeView', 'Mitarbeitersicht')}
            </SelectItem>
            <SelectItem value="PROJECT_CENTRIC" className="text-xs">
              {t('deploy.coarse.projectView', 'Projektsicht')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
