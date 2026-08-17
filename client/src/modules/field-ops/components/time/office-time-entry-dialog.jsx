'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Loader2, Plus, Trash2 } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showError, showSuccess } from '@/lib/toast';

const NONE = 'none';
const todayISO = () => new Date().toISOString().slice(0, 10);

/** "07:20" + a date → an ISO instant the API accepts. */
function toISO(date, time) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
}

function minutesBetween(date, from, to) {
  if (!from || !to) return 0;
  const diff = (new Date(`${date}T${to}:00`) - new Date(`${date}T${from}:00`)) / 60000;
  return diff > 0 ? diff : 0;
}

const hoursLabel = (minutes) => `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}`;

/**
 * Book office and administrative hours — the working time that belongs to no
 * assignment. Several ranges per day, as people actually work them (morning,
 * afternoon), with the company lunch break applied to the day as a whole.
 */
export function OfficeTimeEntryDialog({ open, onOpenChange, onSaved }) {
  const { t } = useLanguage();
  const qc = useQueryClient();

  const [date, setDate] = useState(todayISO);
  const [ranges, setRanges] = useState([{ from: '07:20', to: '12:00' }, { from: '13:00', to: '17:30' }]);
  const [categoryId, setCategoryId] = useState(NONE);
  const [note, setNote] = useState('');
  const [breakOverride, setBreakOverride] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['mobile', 'office-categories'],
    queryFn: async () => (await apiClient.get('/mobile/office-categories'))?.data ?? [],
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const { data: settings } = useQuery({
    queryKey: ['mobile', 'work-time-settings'],
    queryFn: async () => (await apiClient.get('/mobile/work-time-settings'))?.data,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setRanges([{ from: '07:20', to: '12:00' }, { from: '13:00', to: '17:30' }]);
    setCategoryId(NONE);
    setNote('');
    setBreakOverride('');
  }, [open]);

  const grossMinutes = useMemo(
    () => ranges.reduce((total, range) => total + minutesBetween(date, range.from, range.to), 0),
    [ranges, date],
  );

  // Mirror the server rule so the total shown matches what will be stored.
  const autoBreak = useMemo(() => {
    if (!settings) return 0;
    return grossMinutes / 60 >= (settings.breakThresholdHours ?? 6) ? (settings.breakDurationMin ?? 0) : 0;
  }, [settings, grossMinutes]);
  const effectiveBreak = breakOverride === '' ? autoBreak : Number(breakOverride);
  const netMinutes = Math.max(0, grossMinutes - effectiveBreak);

  const valid = ranges.some((range) => minutesBetween(date, range.from, range.to) > 0);

  const save = useMutation({
    mutationFn: async () => {
      const usable = ranges.filter((range) => minutesBetween(date, range.from, range.to) > 0);
      // The break belongs to the day, not to a range — deduct it from the first
      // one so the day's total is right without inventing a phantom entry.
      let remainingBreak = effectiveBreak;
      // MOBILE.TIME_ENTRIES, not TIME_TRACKING.TIME_ENTRIES: the latter is the
      // office-side listing/export API and has no create route.
      const created = [];
      for (const range of usable) {
        const rangeBreak = Math.min(remainingBreak, minutesBetween(date, range.from, range.to));
        remainingBreak -= rangeBreak;
        created.push(await apiClient.post(ENDPOINTS.MOBILE.TIME_ENTRIES, {
          date: new Date(`${date}T00:00:00`).toISOString(),
          startTime: toISO(date, range.from),
          endTime: toISO(date, range.to),
          breakDurationMin: rangeBreak,
          activityType: 'ADMINISTRATIVE',
          officeCategoryId: categoryId === NONE ? null : categoryId,
          note: note.trim() || null,
        }));
      }
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-ops'] });
      qc.invalidateQueries({ queryKey: ['mobile'] });
      showSuccess(t('timeTracking.office.saved', 'Arbeitszeit erfasst'));
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) => showError(err),
  });

  const setRange = (index, key, value) => setRanges((current) => current.map(
    (range, i) => (i === index ? { ...range, [key]: value } : range),
  ));

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            {t('timeTracking.office.title', 'Büroarbeiten erfassen')}
          </DialogTitle>
          <DialogDescription>
            {t('timeTracking.office.desc', 'Arbeitszeit ohne Projekt oder Serviceeinsatz, über Von und Bis.')}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <div className="space-y-1.5">
            <Label>{t('timeTracking.office.date', 'Datum')}*</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={save.isPending} />
          </div>

          <div className="space-y-2">
            <Label>{t('timeTracking.office.ranges', 'Von / Bis')}*</Label>
            {ranges.map((range, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="time" value={range.from}
                  onChange={(e) => setRange(index, 'from', e.target.value)}
                  disabled={save.isPending}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time" value={range.to}
                  onChange={(e) => setRange(index, 'to', e.target.value)}
                  disabled={save.isPending}
                />
                <span className="w-16 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                  {hoursLabel(minutesBetween(date, range.from, range.to))}
                </span>
                {ranges.length > 1 && (
                  <Button
                    type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => setRanges((current) => current.filter((_, i) => i !== index))}
                    disabled={save.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
              onClick={() => setRanges((current) => [...current, { from: '', to: '' }])}
              disabled={save.isPending}
            >
              <Plus className="h-3 w-3" /> {t('timeTracking.office.addRange', 'Weitere Zeitspanne')}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('timeTracking.office.category', 'Kategorie')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={save.isPending}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category._id} value={category._id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('timeTracking.office.break', 'Pause (Minuten)')}</Label>
              <Input
                type="number" min="0"
                value={breakOverride}
                placeholder={String(autoBreak)}
                onChange={(e) => setBreakOverride(e.target.value)}
                disabled={save.isPending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('timeTracking.office.note', 'Notiz')}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={save.isPending} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">
              {t('timeTracking.office.total', 'Total')} · {t('timeTracking.office.breakShort', 'Pause')} {effectiveBreak} min
            </span>
            <span className="font-semibold tabular-nums text-foreground">{hoursLabel(netMinutes)}</span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" className="gap-2" disabled={!valid || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save', 'Speichern')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
