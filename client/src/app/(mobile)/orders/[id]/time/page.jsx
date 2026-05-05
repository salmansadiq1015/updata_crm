'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Play,
  Pause,
  Square,
  Coffee,
  Plus,
  Trash2,
  Clock,
  CheckCircle2,
  Edit2,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useTimeMutations } from '@/modules/mobile/hooks/use-time-mutations';
import { useOrderTimeEntries } from '@/modules/mobile/hooks/use-time-queries';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { useTimer } from '@/modules/mobile/hooks/use-timer';
import { createTimeEntrySchema } from '@/modules/mobile/validations/time-entry';
import { ACTIVITY_TYPE, RELEASE_STATUS, REPORT_STATUS } from '@/modules/mobile/constants/mobile-constants';
import { useOrderReports } from '@/modules/mobile/hooks/use-report-queries';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const ACTIVITY_LABELS = {
  [ACTIVITY_TYPE.TRAVEL]: { de: 'Fahrt', en: 'Travel' },
  [ACTIVITY_TYPE.ONSITE_WORK]: { de: 'Vor-Ort-Arbeit', en: 'On-site Work' },
  [ACTIVITY_TYPE.ADMINISTRATIVE]: { de: 'Administrativ', en: 'Administrative' },
  [ACTIVITY_TYPE.OTHER]: { de: 'Sonstiges', en: 'Other' },
};

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TimePage() {
  const { id: orderId } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const isOnline = useNetworkStatus();

  const [showManualForm, setShowManualForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const { data: entries, isLoading, isOffline } = useOrderTimeEntries(orderId);
  const { data: reports } = useOrderReports(orderId);

  const { createEntry, updateEntry, deleteEntry, releaseEntry } = useTimeMutations(orderId);

  const hasSubmittedReport = Array.isArray(reports) && reports.some(
    (r) => r.status === REPORT_STATUS.SUBMITTED || r.status === REPORT_STATUS.APPROVED
  );

  const activeEntries = (entries || []).filter((e) => !e.is_deleted);
  const totalMinutes = activeEntries.reduce((sum, e) => sum + (e.net_duration_min || 0), 0);

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.time.title', 'Zeiterfassung')}
        showBack
        right={
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-lg">
            {formatDuration(totalMinutes)}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto pb-32">
        {/* Timer widget */}
        <TimerWidget orderId={orderId} lang={lang} createEntry={createEntry} />

        {/* Entry list */}
        <div className="px-4 py-4 space-y-3">
          {isLoading ? (
            <TimeEntrySkeleton />
          ) : activeEntries.length === 0 ? (
            <EmptyState
              variant="empty"
              title={lang === 'de' ? 'Keine Zeiteinträge' : 'No time entries'}
              description={
                lang === 'de'
                  ? 'Starten Sie den Timer oder erfassen Sie manuell.'
                  : 'Start the timer or add an entry manually.'
              }
            />
          ) : (
            activeEntries.map((entry) => (
              <TimeEntryCard
                key={entry.id}
                entry={entry}
                lang={lang}
                orderId={orderId}
                hasSubmittedReport={hasSubmittedReport}
                onEdit={() => {
                  setEditingEntry(entry);
                  setShowManualForm(true);
                }}
                onDelete={() => deleteEntry.mutate(entry.id)}
                onRelease={
                  isOnline && entry.release_status === RELEASE_STATUS.PENDING
                    ? () => releaseEntry.mutate(entry.id)
                    : undefined
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Add manual entry button */}
      <div className="fixed bottom-16 left-0 right-0 bg-background border-t border-border px-4 py-3 z-30">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setEditingEntry(null);
            setShowManualForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {lang === 'de' ? 'Manueller Eintrag' : 'Manual Entry'}
        </Button>
      </div>

      {/* Manual entry form overlay */}
      {showManualForm && (
        <ManualEntryForm
          orderId={orderId}
          entry={editingEntry}
          lang={lang}
          onClose={() => {
            setShowManualForm(false);
            setEditingEntry(null);
          }}
          createEntry={createEntry}
          updateEntry={updateEntry}
        />
      )}
    </div>
  );
}

function TimerWidget({ orderId, lang, createEntry }) {
  const timer = useTimer(orderId);

  const formatElapsed = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const handleStop = async () => {
    if (!timer.timerStartedAt) return;
    const startTime = new Date(timer.timerStartedAt);
    const endTime = new Date();
    const breakMin = timer.breakStartedAt
      ? Math.round((Date.now() - new Date(timer.breakStartedAt).getTime()) / 60000)
      : 0;

    timer.stop();
    try {
      await createEntry.mutateAsync({
        date: startTime,
        startTime,
        endTime,
        breakDurationMin: breakMin,
        activityType: timer.activityType || ACTIVITY_TYPE.ONSITE_WORK,
        note: '',
      });
    } catch {
      // toast handled by mutation
    }
  };

  if (!timer.isActive) {
    return (
      <div className="px-4 py-4 border-b border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          {lang === 'de' ? 'Timer starten' : 'Start Timer'}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ACTIVITY_LABELS).map(([key, labels]) => (
            <button
              key={key}
              onClick={() => timer.start(key)}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-border bg-card text-sm font-medium active:bg-muted/50 transition-colors"
            >
              <Play className="h-4 w-4 text-primary" />
              {labels[lang]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-border bg-primary/5">
      <div className="text-center mb-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {ACTIVITY_LABELS[timer.activityType]?.[lang] || timer.activityType}
        </p>
        <p className="text-4xl font-mono font-bold tabular-nums text-foreground">
          {formatElapsed(timer.elapsed)}
        </p>
        {timer.breakStartedAt && (
          <p className="text-sm text-amber-600 mt-1">
            <Coffee className="h-3.5 w-3.5 inline mr-1" />
            {lang === 'de' ? 'Pause' : 'Break'}: {formatElapsed(timer.breakElapsed)}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        {timer.isRunning ? (
          <>
            <Button
              variant="outline"
              className="flex-1"
              onClick={timer.startBreak}
            >
              <Coffee className="h-4 w-4 mr-1.5" />
              {lang === 'de' ? 'Pause' : 'Break'}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={timer.pause}
            >
              <Pause className="h-4 w-4 mr-1.5" />
              {lang === 'de' ? 'Anhalten' : 'Pause'}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            className="flex-1"
            onClick={timer.resume}
          >
            <Play className="h-4 w-4 mr-1.5" />
            {lang === 'de' ? 'Fortsetzen' : 'Resume'}
          </Button>
        )}
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleStop}
        >
          <Square className="h-4 w-4 mr-1.5" />
          {lang === 'de' ? 'Stopp' : 'Stop'}
        </Button>
      </div>
    </div>
  );
}

function TimeEntryCard({ entry, lang, orderId, hasSubmittedReport, onEdit, onDelete, onRelease }) {
  const startTime = entry.startTime || entry.start_time;
  const endTime = entry.endTime || entry.end_time;
  const activityType = entry.activityType || entry.activity_type;
  const releaseStatus = entry.releaseStatus || entry.release_status;
  const netDuration = entry.net_duration_min || entry.netDurationMin || 0;

  const canRelease = onRelease && hasSubmittedReport;
  const blockedRelease = onRelease && !hasSubmittedReport;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-muted px-2 py-0.5 rounded-md">
            {ACTIVITY_LABELS[activityType]?.[lang] || activityType}
          </span>
          {releaseStatus === RELEASE_STATUS.RELEASED && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="h-3 w-3" />
              {lang === 'de' ? 'Freigegeben' : 'Released'}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {canRelease && (
            <Button variant="ghost" size="sm" onClick={onRelease} className="h-11 w-11 p-0 text-green-600" aria-label="Release">
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-11 w-11 p-0" aria-label="Edit">
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-11 w-11 p-0 text-destructive" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {blockedRelease && (
        <div className="mb-2 flex items-center gap-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {lang === 'de'
              ? 'Bericht muss zuerst eingereicht werden.'
              : 'Work report must be submitted first.'}
          </span>
          <Link href={`/orders/${orderId}/report`} className="underline underline-offset-1 shrink-0 font-medium">
            {lang === 'de' ? 'Zum Bericht' : 'Go to report'}
          </Link>
        </div>
      )}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {startTime && (
            <span>
              {new Date(startTime).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {endTime && (
            <>
              <span>–</span>
              <span>
                {new Date(endTime).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </>
          )}
        </div>
        {netDuration > 0 && (
          <span className="font-medium">{formatDuration(netDuration)}</span>
        )}
        {(entry.breakDurationMin || entry.break_duration_min) > 0 && (
          <span className="text-xs text-muted-foreground">
            <Coffee className="h-3 w-3 inline mr-0.5" />
            {entry.breakDurationMin || entry.break_duration_min}m
          </span>
        )}
      </div>
      {(entry.note) && (
        <p className="text-xs text-muted-foreground mt-2 truncate">{entry.note}</p>
      )}
    </div>
  );
}

function ManualEntryForm({ orderId, entry, lang, onClose, createEntry, updateEntry }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createTimeEntrySchema),
    defaultValues: {
      date: entry?.date ? new Date(entry.date) : new Date(),
      startTime: entry?.startTime || entry?.start_time ? new Date(entry.startTime || entry.start_time) : new Date(),
      endTime: entry?.endTime || entry?.end_time ? new Date(entry.endTime || entry.end_time) : null,
      breakDurationMin: entry?.breakDurationMin || entry?.break_duration_min || 0,
      activityType: entry?.activityType || entry?.activity_type || ACTIVITY_TYPE.ONSITE_WORK,
      note: entry?.note || '',
    },
  });

  const onSubmit = async (data) => {
    try {
      if (entry?.id) {
        await updateEntry.mutateAsync({ entryId: entry.id, data });
      } else {
        await createEntry.mutateAsync(data);
      }
      onClose();
    } catch {
      // toast handled by mutation
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg bg-background rounded-t-2xl p-6 space-y-4 animate-in slide-in-from-bottom duration-200 max-h-[85vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">
          {entry
            ? (lang === 'de' ? 'Eintrag bearbeiten' : 'Edit Entry')
            : (lang === 'de' ? 'Manueller Eintrag' : 'Manual Entry')}
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label={lang === 'de' ? 'Datum' : 'Date'} required error={errors.date?.message}>
            <Controller
              name="date"
              control={control}
              render={({ field }) => (
                <Input
                  type="date"
                  value={toDateLocal(field.value)}
                  onChange={(e) => field.onChange(new Date(e.target.value))}
                  disabled={isSubmitting}
                  className="h-11"
                />
              )}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={lang === 'de' ? 'Start' : 'Start'} required error={errors.startTime?.message}>
              <Controller
                name="startTime"
                control={control}
                render={({ field }) => (
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocal(field.value)}
                    onChange={(e) => field.onChange(new Date(e.target.value))}
                    disabled={isSubmitting}
                    className="h-11"
                  />
                )}
              />
            </FormField>
            <FormField label={lang === 'de' ? 'Ende' : 'End'} error={errors.endTime?.message}>
              <Controller
                name="endTime"
                control={control}
                render={({ field }) => (
                  <Input
                    type="datetime-local"
                    value={toDatetimeLocal(field.value)}
                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : null)}
                    disabled={isSubmitting}
                    className="h-11"
                  />
                )}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label={lang === 'de' ? 'Tätigkeitsart' : 'Activity Type'}
              required
              error={errors.activityType?.message}
            >
              <Controller
                name="activityType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTIVITY_LABELS).map(([key, labels]) => (
                        <SelectItem key={key} value={key}>
                          {labels[lang]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label={lang === 'de' ? 'Pause (min)' : 'Break (min)'}
              error={errors.breakDurationMin?.message}
            >
              <Input
                type="number"
                min={0}
                {...register('breakDurationMin', { valueAsNumber: true })}
                disabled={isSubmitting}
                className="h-11"
              />
            </FormField>
          </div>

          <FormField label={lang === 'de' ? 'Notiz' : 'Note'} error={errors.note?.message}>
            <Input
              {...register('note')}
              placeholder={lang === 'de' ? 'Optionale Notiz...' : 'Optional note...'}
              disabled={isSubmitting}
              className="h-11"
            />
          </FormField>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {lang === 'de' ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || createEntry.isPending || updateEntry.isPending}
            >
              {entry
                ? (lang === 'de' ? 'Aktualisieren' : 'Update')
                : (lang === 'de' ? 'Erstellen' : 'Create')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TimeEntrySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
      ))}
    </div>
  );
}
