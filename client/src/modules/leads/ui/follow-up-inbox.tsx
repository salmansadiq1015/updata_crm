'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlarmClock, ArrowLeft, Ban, CalendarClock, Check, Loader2, Mail, MessageCircle, MessageSquare, Phone, ShieldOff, UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { showError, showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import {
  useFollowUpAction, useFollowUps, useFollowUpSummary, useLeadWorkflowRealtime, viewerTimezone,
} from '../hooks/use-lead-workflow';
import { leadWorkflowApi } from '../services/lead-workflow-api';
import type { FollowUp, FollowUpBucket, FollowUpScope } from '../types/lead-workflow-types';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';

/**
 * Unified follow-up inbox: overdue / today / upcoming / done across leads,
 * for me, my team or everyone (supervisors). Each due time is shown in the
 * follow-up's own timezone (when recorded) and in the viewer's. Suppressed
 * leads show the reason and their contact action is blocked; the server
 * re-checks suppression at action time.
 */

const BUCKETS: { key: FollowUpBucket; fallback: string }[] = [
  { key: 'overdue', fallback: 'Overdue' },
  { key: 'today', fallback: 'Today' },
  { key: 'upcoming', fallback: 'Upcoming' },
  { key: 'done', fallback: 'Done' },
];

const CHANNEL_ICON: Record<string, typeof Phone> = { phone: Phone, sms: MessageSquare, email: Mail, whatsapp: MessageCircle };

export function formatInZone(iso: string | null, locale: string, timeZone?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(intlLocaleFor(locale), {
      dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

export function suppressionText(reason: string | null, t: TranslateFn): string {
  return t(`leads.followUps.suppression.${reason ?? 'unknown'}`, (reason ?? 'unknown').replace(/_/g, ' '));
}

type Pending =
  | { kind: 'complete'; item: FollowUp }
  | { kind: 'snooze'; item: FollowUp }
  | { kind: 'reassign'; item: FollowUp }
  | { kind: 'cancel'; item: FollowUp };

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ActionDialog({ pending, onClose, users }: { pending: Pending | null; onClose: () => void; users: LeadUser[] }) {
  const { t } = useLanguage();
  const action = useFollowUpAction();
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [owner, setOwner] = useState('');
  useEffect(() => {
    setText('');
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    setWhen(toLocalInput(tomorrow));
    setOwner('');
  }, [pending]);
  if (!pending) return null;
  const { item, kind } = pending;
  const run = () => {
    const done = { onSuccess: () => { showSuccess(t('leads.followUps.saved', 'Follow-up updated')); onClose(); }, onError: (err: unknown) => showError(err) };
    if (kind === 'complete') action.mutate({ id: item.id, action: 'complete', body: { note: text.trim() || null } }, done);
    if (kind === 'cancel') action.mutate({ id: item.id, action: 'cancel', body: { reason: text.trim() } }, done);
    if (kind === 'snooze') action.mutate({ id: item.id, action: 'snooze', body: { until: new Date(when).toISOString() } }, done);
    if (kind === 'reassign') action.mutate({ id: item.id, action: 'reassign', body: { ownerId: owner } }, done);
  };
  const invalid = (kind === 'cancel' && !text.trim()) || (kind === 'snooze' && !(when && new Date(when).getTime() > Date.now())) || (kind === 'reassign' && !owner);
  const titles: Record<Pending['kind'], string> = {
    complete: t('leads.followUps.completeTitle', 'Mark follow-up as done'),
    snooze: t('leads.followUps.snoozeTitle', 'Snooze follow-up'),
    reassign: t('leads.followUps.reassignTitle', 'Reassign follow-up'),
    cancel: t('leads.followUps.cancelTitle', 'Cancel follow-up'),
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
          <DialogDescription>{item.lead.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(kind === 'complete' || kind === 'cancel') && (
            <>
              <Label htmlFor="fu-text">{kind === 'cancel' ? t('leads.followUps.cancelReason', 'Reason (required)') : t('leads.followUps.completeNote', 'Outcome note (optional)')}</Label>
              <Textarea id="fu-text" rows={3} maxLength={kind === 'cancel' ? 1000 : 2000} value={text} onChange={(e) => setText(e.target.value)} />
            </>
          )}
          {kind === 'snooze' && (
            <>
              <Label htmlFor="fu-when">{t('leads.followUps.snoozeUntil', 'Snooze until (your time)')}</Label>
              <Input id="fu-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {[1, 4, 24].map((h) => (
                  <Button key={h} size="sm" variant="outline" onClick={() => setWhen(toLocalInput(new Date(Date.now() + h * 3_600_000)))}>
                    {t('leads.followUps.inHours', 'In {hours} h', { hours: h })}
                  </Button>
                ))}
              </div>
            </>
          )}
          {kind === 'reassign' && (
            <>
              <Label htmlFor="fu-owner">{t('leads.followUps.newOwner', 'New owner')}</Label>
              <select id="fu-owner" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="" disabled>{t('leads.answerHistory.choose', 'Choose…')}</option>
                {users.filter((u) => u.id !== item.owner.id).map((u) => <option key={u.id} value={u.id}>{getUserDisplayName(u) || u.id}</option>)}
              </select>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={run} disabled={invalid || action.isPending} className="gap-1.5">
            {action.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t('leads.followUps.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpRow({ item, locale, tz, t, onAction }: {
  item: FollowUp; locale: string; tz: string; t: TranslateFn; onAction: (p: Pending) => void;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const Icon = (item.channel && CHANNEL_ICON[item.channel]) || CalendarClock;
  const open = item.status === 'open' || item.status === 'snoozed';
  const blocked = Boolean(item.suppression?.suppressed);
  const showOwnZone = item.timezone && item.timezone !== tz;

  const contact = async () => {
    setChecking(true);
    try {
      await leadWorkflowApi.contactCheck(item.id, item.channel);
      router.push(`/leads?detail=${item.leadId}`);
    } catch (err) {
      showError((err as { code?: string }).code === 'CONTACT_SUPPRESSED'
        ? t('leads.followUps.blockedNow', 'Contact is blocked for this lead (suppressed).')
        : err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <li className={cn('rounded-xl border bg-card px-4 py-3 shadow-sm', item.bucket === 'overdue' ? 'border-rose-500/30' : 'border-border/70')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600/10 via-blue-500/10 to-cyan-500/10 text-blue-700 dark:text-cyan-300">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/leads?detail=${item.leadId}`} className="truncate text-sm font-semibold hover:underline">{item.lead.name}</Link>
              {item.lead.leadNumber && <span className="font-mono text-[11px] text-muted-foreground">{item.lead.leadNumber}</span>}
              {item.status === 'snoozed' && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t('leads.followUps.snoozed', 'Snoozed')}</span>}
              {item.bucket === 'overdue' && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">{t('leads.followUps.bucket.overdue', 'Overdue')}</span>}
            </div>
            <p className="text-xs">
              <span className="font-medium">{formatInZone(item.nextDueAt, locale, tz)}</span>
              <span className="text-muted-foreground"> · {t('leads.followUps.yourTime', 'your time')}</span>
              {showOwnZone && (
                <span className="text-muted-foreground"> · {formatInZone(item.nextDueAt, locale, item.timezone)} ({item.timezone})</span>
              )}
              {!item.timezone && <span className="text-muted-foreground"> · {t('leads.followUps.tzUnknown', 'planned timezone not recorded')}</span>}
            </p>
            {item.status === 'snoozed' && item.dueAt !== item.nextDueAt && (
              <p className="text-[11px] text-muted-foreground">{t('leads.followUps.originallyDue', 'Originally due {date}', { date: formatInZone(item.dueAt, locale, tz) })}</p>
            )}
            {item.note && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]" dir="auto">{item.note}</p>}
            {item.source.requestedTimeText && <p className="text-[11px] text-muted-foreground">{t('leads.history.requestedTime', 'Requested: “{text}”', { text: item.source.requestedTimeText })}</p>}
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" aria-hidden="true" />{item.owner.name ?? t('leads.assignee.unknown', 'Unknown user')}</span>
              <span>· {t(`leads.followUps.source.${item.source.type}`, item.source.type.replace(/_/g, ' '))}</span>
            </p>
            {blocked && (
              <p className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                {t('leads.followUps.suppressed', 'Suppressed — {reason}', { reason: suppressionText(item.suppression?.reason ?? null, t) })}
              </p>
            )}
            {!blocked && item.suppression?.limited && (
              <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('leads.followUps.limited', 'Contact limit — {reason}; next allowed {date}', {
                  reason: suppressionText(item.suppression.reason, t),
                  date: formatInZone(item.suppression.nextAllowedAt, locale, tz),
                })}
              </p>
            )}
            {item.status === 'done' && item.completionNote && <p className="text-xs">{item.completionNote}</p>}
            {item.status === 'cancelled' && item.cancelReason && <p className="text-xs text-muted-foreground">{t('leads.followUps.cancelledBecause', 'Cancelled: {reason}', { reason: item.cancelReason })}</p>}
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <Button size="sm" className="gap-1 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white" disabled={blocked || checking} onClick={contact} title={blocked ? t('leads.followUps.blocked', 'Contact blocked') : undefined}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Phone className="h-3.5 w-3.5" aria-hidden="true" />}
              {blocked ? t('leads.followUps.blocked', 'Contact blocked') : t('leads.followUps.contact', 'Contact')}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onAction({ kind: 'complete', item })}><Check className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.complete', 'Done')}</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'snooze', item })}>{t('leads.followUps.snooze', 'Snooze')}</Button>
            <Button size="sm" variant="outline" onClick={() => onAction({ kind: 'reassign', item })}>{t('leads.followUps.reassign', 'Reassign')}</Button>
            <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => onAction({ kind: 'cancel', item })}><Ban className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.cancel', 'Cancel')}</Button>
          </div>
        )}
      </div>
    </li>
  );
}

export function FollowUpInbox() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('lead:write');
  const canAll = hasPermission('lead:assign-policy');
  const [tz] = useState(() => viewerTimezone());
  const [scope, setScope] = useState<FollowUpScope>('mine');
  const [bucket, setBucket] = useState<FollowUpBucket>('overdue');
  const [pending, setPending] = useState<Pending | null>(null);
  useLeadWorkflowRealtime();
  const summary = useFollowUpSummary(scope, tz);
  const list = useFollowUps({ scope, bucket, tz });
  const users = (useWorkspaceUsers().data ?? []) as LeadUser[];
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting) && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const counts: Partial<Record<FollowUpBucket, number>> = summary.data ? { overdue: summary.data.overdue, today: summary.data.today, upcoming: summary.data.upcoming } : {};

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 text-white shadow-sm">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('leads.followUps.title', 'Follow-ups')}</h1>
            <p className="text-sm text-muted-foreground">{t('leads.followUps.subtitle', 'Times are shown in your timezone ({tz}) and, where recorded, in the timezone the follow-up was planned in.', { tz })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href="/leads"><ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />{t('sidebar.leads', 'Leads')}</Link>
          </Button>
          <label className="sr-only" htmlFor="fu-scope">{t('leads.followUps.scope', 'Whose follow-ups')}</label>
          <select id="fu-scope" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={scope} onChange={(e) => setScope(e.target.value as FollowUpScope)}>
            <option value="mine">{t('leads.followUps.scope.mine', 'Mine')}</option>
            <option value="team">{t('leads.followUps.scope.team', 'My team')}</option>
            {canAll && <option value="all">{t('leads.followUps.scope.all', 'Everyone')}</option>}
          </select>
        </div>
      </div>

      <div role="tablist" aria-label={t('leads.followUps.buckets', 'Follow-up buckets')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            role="tab"
            type="button"
            aria-selected={bucket === b.key}
            onClick={() => setBucket(b.key)}
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              bucket === b.key ? 'border-transparent bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white' : 'border-border bg-card hover:bg-muted',
            )}
          >
            {t(`leads.followUps.bucket.${b.key}`, b.fallback)}
            {counts[b.key] != null && <span className={cn('rounded-full px-2 text-xs', bucket === b.key ? 'bg-white/20' : b.key === 'overdue' && counts[b.key] ? 'bg-rose-600 text-white' : 'bg-muted')}>{counts[b.key]}</span>}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="skeleton-shimmer h-24 rounded-xl bg-muted" aria-hidden="true" />
      ) : list.isError ? (
        <button type="button" className="text-sm text-destructive underline" onClick={() => void list.refetch()}>{t('leads.followUps.loadError', 'Follow-ups could not be loaded. Retry')}</button>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('leads.followUps.empty', 'Nothing here.')}</p>
      ) : (
        <ul className="space-y-2" role="tabpanel">
          {items.map((item) => (
            <FollowUpRow key={item.id} item={item} locale={locale} tz={tz} t={t} onAction={(p) => (canWrite ? setPending(p) : undefined)} />
          ))}
        </ul>
      )}
      <div ref={sentinel} aria-hidden="true" />
      {list.hasNextPage && (
        <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {list.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('leads.history.loadMore', 'Load older entries')}
        </Button>
      )}
      <ActionDialog pending={pending} onClose={() => setPending(null)} users={users} />
    </div>
  );
}
