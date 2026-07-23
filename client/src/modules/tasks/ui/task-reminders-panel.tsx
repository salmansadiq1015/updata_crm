'use client';

import { useMemo, useState } from 'react';
import { Bell, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TaskReminder, TaskReminderChannel, TaskReminderInput } from '../types/task-types';

const RELATIVE_OPTIONS = [
  { key: 'tasks.reminders.offset2h', fallback: '2 Std. vorher', minutes: -120 },
  { key: 'tasks.reminders.offset1d', fallback: '1 Tag vorher', minutes: -1440 },
  { key: 'tasks.reminders.offset1w', fallback: '1 Woche vorher', minutes: -10080 },
];

const REMINDER_STATUS_KEYS: Record<string, { key: string; fallback: string }> = {
  PENDING:   { key: 'tasks.reminders.statusPending',   fallback: 'Geplant' },
  FIRED:     { key: 'tasks.reminders.statusFired',     fallback: 'Ausgelöst' },
  SNOOZED:   { key: 'tasks.reminders.statusSnoozed',   fallback: 'Zurückgestellt' },
  CANCELLED: { key: 'tasks.reminders.statusCancelled', fallback: 'Abgebrochen' },
};

const SNOOZE_OPTIONS = [
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '4h', minutes: 240 },
  { label: '1d', minutes: 1440 },
];

type TaskRemindersPanelProps = {
  reminders: TaskReminder[];
  isLoading: boolean;
  dueDate: string | null;
  onCreateReminder: (input: TaskReminderInput) => void;
  onDeleteReminder: (id: string) => void;
  onSnoozeReminder: (id: string, minutes: number) => void;
  isSaving?: boolean;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function TaskRemindersPanel({
  reminders,
  isLoading,
  dueDate,
  onCreateReminder,
  onDeleteReminder,
  onSnoozeReminder,
  isSaving,
}: TaskRemindersPanelProps) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'RELATIVE' | 'ABSOLUTE'>('RELATIVE');
  const [offsetMinutes, setOffsetMinutes] = useState('-1440');
  const [absoluteAt, setAbsoluteAt] = useState('');
  const [customSnooze, setCustomSnooze] = useState('');

  const canAdd = useMemo(() => {
    if (mode === 'RELATIVE') return Boolean(dueDate);
    return Boolean(absoluteAt);
  }, [absoluteAt, dueDate, mode]);

  const create = () => {
    const channels: TaskReminderChannel[] = ['IN_APP', 'PUSH'];
    if (mode === 'RELATIVE') {
      onCreateReminder({ type: 'RELATIVE', offsetMinutes: Number(offsetMinutes), channels });
      return;
    }
    onCreateReminder({ type: 'ABSOLUTE', fireAt: new Date(absoluteAt).toISOString(), channels });
    setAbsoluteAt('');
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          {t('tasks.reminders.title', 'Erinnerungen')}
        </h4>
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="rounded-md border border-border bg-background p-2">
        <div className="grid grid-cols-[88px_1fr_auto] gap-2">
          <Select value={mode} onValueChange={(value) => setMode(value as 'RELATIVE' | 'ABSOLUTE')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RELATIVE">{t('tasks.reminders.modeRelative', 'Relativ')}</SelectItem>
              <SelectItem value="ABSOLUTE">{t('tasks.reminders.modeAbsolute', 'Zeitpunkt')}</SelectItem>
            </SelectContent>
          </Select>

          {mode === 'RELATIVE' ? (
            <Select value={offsetMinutes} onValueChange={setOffsetMinutes} disabled={!dueDate}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIVE_OPTIONS.map((option) => (
                  <SelectItem key={option.minutes} value={String(option.minutes)}>{t(option.key, option.fallback)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type="datetime-local"
              value={absoluteAt}
              onChange={(event) => setAbsoluteAt(event.target.value)}
              className="h-8 text-xs"
            />
          )}

          <Button type="button" size="icon" className="h-8 w-8" disabled={!canAdd || reminders.length >= 5} onClick={create}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : reminders.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          {t('tasks.reminders.empty', 'Keine Erinnerungen')}
        </div>
      ) : (
        <div className="space-y-1.5">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="rounded-md border border-border bg-background p-2">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{formatDateTime(reminder.fireAt)}</div>
                  <div className="text-[11px] text-muted-foreground">{t(REMINDER_STATUS_KEYS[reminder.status]?.key ?? '', REMINDER_STATUS_KEYS[reminder.status]?.fallback ?? reminder.status)}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDeleteReminder(reminder.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {reminder.status !== 'FIRED' ? (
                <div className="mt-2 flex items-center gap-1.5">
                  {SNOOZE_OPTIONS.map((option) => (
                    <Button
                      key={option.minutes}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => onSnoozeReminder(reminder.id, option.minutes)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    max={10080}
                    value={customSnooze}
                    onChange={(event) => setCustomSnooze(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && customSnooze) {
                        onSnoozeReminder(reminder.id, Number(customSnooze));
                        setCustomSnooze('');
                      }
                    }}
                    className="h-6 w-16 px-2 text-[11px]"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
