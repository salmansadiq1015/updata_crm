'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useCoarseMutations } from '../../hooks/use-coarse-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { CoarseProjectPicker } from './coarse-project-picker';

export function CoarseBulkDialog({ open, onOpenChange, employeeId, year, weekFrom, weekTo }) {
  const { t } = useLanguage();
  const { bulkUpsert } = useCoarseMutations({ onBulk: () => onOpenChange(false) });

  const [projectId, setProjectId] = useState('');
  const [percent, setPercent] = useState('50');
  const [fromWeek, setFromWeek] = useState(weekFrom);
  const [toWeek, setToWeek] = useState(weekTo);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!projectId || !percent) return;

    const allocations = [];
    for (let w = fromWeek; w <= toWeek; w++) {
      allocations.push({
        employeeId,
        projectId,
        calendarYear: year,
        calendarWeek: w,
        allocationPercent: Number(percent),
      });
    }
    bulkUpsert.mutate({ allocations });
  };

  const weekCount = Math.max(0, toWeek - fromWeek + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t('deploy.coarse.bulkTitle', 'Mehrwochen-Zuteilung')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">{t('deploy.coarse.project', 'Projekt')}</Label>
            <CoarseProjectPicker value={projectId} onChange={setProjectId} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">{t('deploy.coarse.fromWeek', 'Von KW')}</Label>
              <Input
                type="number"
                value={fromWeek}
                onChange={(e) => setFromWeek(Number(e.target.value))}
                min={1}
                max={53}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('deploy.coarse.toWeek', 'Bis KW')}</Label>
              <Input
                type="number"
                value={toWeek}
                onChange={(e) => setToWeek(Number(e.target.value))}
                min={fromWeek}
                max={53}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('deploy.coarse.allocation', 'Zuteilung')}</Label>
            <Select value={percent} onValueChange={setPercent}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25" className="text-xs">25%</SelectItem>
                <SelectItem value="50" className="text-xs">50%</SelectItem>
                <SelectItem value="75" className="text-xs">75%</SelectItem>
                <SelectItem value="100" className="text-xs">100%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            {weekCount} {weekCount === 1 ? t('deploy.coarse.weekAllocated', 'Woche wird zugeteilt') : t('deploy.coarse.weeksAllocated', 'Wochen werden zugeteilt')}.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('deploy.common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" size="sm" disabled={!projectId || bulkUpsert.isPending}>
              {bulkUpsert.isPending ? t('deploy.common.saving', 'Wird gespeichert...') : t('deploy.common.allocate', 'Zuteilen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
