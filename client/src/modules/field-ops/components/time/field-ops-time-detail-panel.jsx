'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FieldOpsTimeStatusBadge } from './field-ops-time-status-badge';
import { PermissionGate } from '@/shared/components/permission-gate';
import { ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { Pencil, Unlock, ShieldAlert, Trash2, Clock, Timer, Coffee, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value, className }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn('text-sm', className)}>{value || '—'}</span>
    </div>
  );
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function fmtTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr.slice(11, 16) || '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FieldOpsTimeDetailPanel({
  entry,
  open,
  onOpenChange,
  onEdit,
  onRelease,
  onOverride,
  onDelete,
  isReleasePending,
  isOverridePending,
}) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  if (!entry) return null;

  const isPending = entry.releaseStatus === 'PENDING';
  const isLocked = entry.releaseStatus === 'LOCKED';
  const netMin = entry.netDurationMin ?? entry.net_duration_min ?? 0;
  const breakMin = entry.breakDurationMin ?? entry.break_duration_min ?? 0;

  const activityCfg = ACTIVITY_TYPE_LABELS[entry.activityType];
  const activityLabel = activityCfg ? (de ? activityCfg.label : activityCfg.labelEn) : entry.activityType;

  const technicianName = (() => {
    const t = entry.technicianId;
    if (!t) return '—';
    if (typeof t === 'object') return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim() || '—';
    return '—';
  })();

  const orderLabel = (() => {
    const o = entry.orderId;
    if (!o) return '—';
    if (typeof o === 'object') return o.assignmentNumber ? `#${o.assignmentNumber} — ${o.title || ''}` : (o.title || '—');
    return '—';
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-[50vw] !max-w-[50vw] overflow-y-auto flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base">
              {de ? 'Zeiteintrag' : 'Time Entry'}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <FieldOpsTimeStatusBadge status={entry.releaseStatus} />
              {onEdit && (
                <button
                  onClick={() => onEdit(entry)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(entry.date)} · {activityLabel}
          </p>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Net duration hero */}
          <div className="rounded-xl bg-primary/6 border border-primary/15 px-4 py-4 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <Timer className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{de ? 'Nettozeit' : 'Net Duration'}</p>
              <p className="text-2xl font-bold font-mono text-primary">{fmtDuration(netMin)}</p>
            </div>
          </div>

          {/* Time details */}
          <Section icon={Clock} title={de ? 'Zeitdetails' : 'Time Details'}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailRow label={de ? 'Datum' : 'Date'} value={formatDate(entry.date)} />
              <DetailRow
                label={de ? 'Zeitspanne' : 'Time Range'}
                value={`${fmtTime(entry.startTime)} → ${fmtTime(entry.endTime)}`}
              />
              <DetailRow
                label={de ? 'Pause' : 'Break'}
                value={breakMin > 0 ? `${breakMin} min` : (de ? 'Keine' : 'None')}
              />
              <DetailRow
                label={de ? 'Nettozeit' : 'Net'}
                value={fmtDuration(netMin)}
                className="font-semibold font-mono"
              />
            </div>
          </Section>

          <Separator />

          {/* Assignment */}
          <Section icon={Activity} title={de ? 'Zuordnung' : 'Assignment'}>
            <div className="grid grid-cols-1 gap-3">
              <DetailRow label={de ? 'Einsatz' : 'Assignment'} value={orderLabel} />
              <DetailRow label={de ? 'Techniker' : 'Technician'} value={technicianName} />
            </div>
          </Section>

          <Separator />

          {/* Activity */}
          <Section icon={Activity} title={de ? 'Tätigkeit' : 'Activity'}>
            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-muted-foreground block mb-1">{de ? 'Art' : 'Type'}</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                  {activityLabel}
                </span>
              </div>
              {entry.note && (
                <DetailRow label={de ? 'Notiz' : 'Note'} value={entry.note} className="text-sm leading-relaxed" />
              )}
            </div>
          </Section>

          {/* Release info */}
          <Separator />
          <Section icon={Coffee} title={de ? 'Freigabestatus' : 'Release Status'}>
            <div className="space-y-2">
              <FieldOpsTimeStatusBadge status={entry.releaseStatus} size="md" />
              {isLocked && entry.overrideJustification && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                    {de ? 'Override-Begründung' : 'Override Justification'}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">{entry.overrideJustification}</p>
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Footer actions */}
        <div className="border-t px-6 py-4 flex items-center gap-2 justify-between bg-background">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/8 gap-1.5"
            onClick={() => onDelete?.(entry)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {de ? 'Löschen' : 'Delete'}
          </Button>

          <div className="flex gap-2">
            {isPending && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => onRelease?.(entry._id)}
                disabled={isReleasePending}
              >
                <Unlock className="h-3.5 w-3.5" />
                {de ? 'Freigeben' : 'Release'}
              </Button>
            )}
            {isLocked && (
              <PermissionGate permission="time-tracking:admin">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                  onClick={() => onOverride?.(entry._id)}
                  disabled={isOverridePending}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {de ? 'Überschreiben' : 'Override'}
                </Button>
              </PermissionGate>
            )}
            {onEdit && (
              <Button size="sm" className="gap-1.5" onClick={() => { onEdit(entry); onOpenChange(false); }}>
                <Pencil className="h-3.5 w-3.5" />
                {de ? 'Bearbeiten' : 'Edit'}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
