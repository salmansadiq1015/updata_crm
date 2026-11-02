'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlarmClock, ArrowLeft, CalendarClock, Check, CheckCheck, ChevronDown, Clock3, Globe2, Loader2, Mail, MessageCircle, MessageSquare, MoreHorizontal, Phone, Plus, RefreshCw, Search, ShieldOff, UserRound, X,
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
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { useAuthStore } from '@/stores/auth-store';
import { CreateFollowUpDialog, FOLLOW_UP_CHANNELS, CHANNEL_LABELS } from './create-follow-up-dialog';

/**
 * Unified follow-up inbox: overdue / today / upcoming / done across leads,
 * for me, my team or everyone (supervisors). Each due time is shown in the
 * follow-up's own timezone (when recorded) and in the viewer's. Suppressed
 * leads show the reason and their contact action is blocked; the server
 * re-checks suppression at action time.
 */

type InboxBucket = Exclude<FollowUpBucket, 'open'>;

const BUCKETS: { key: InboxBucket; fallback: string }[] = [
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
    return Number.isFinite(Date.parse(iso)) ? new Date(iso).toISOString() : '—';
  }
}

export function suppressionText(reason: string | null, t: TranslateFn): string {
  return t(`leads.followUps.suppression.${reason ?? 'unknown'}`, (reason ?? 'unknown').replace(/_/g, ' '));
}

const BUCKET_DETAILS = {
  overdue: { icon: AlarmClock, description: 'Needs your attention', empty: 'You’re all caught up', hint: 'No overdue follow-ups in this view. Check today’s schedule or plan your next conversation.' },
  today: { icon: Clock3, description: 'Remaining today', empty: 'Your day is clear', hint: 'No remaining follow-ups today. Schedule a conversation or check what’s coming next.' },
  upcoming: { icon: CalendarClock, description: 'Planned ahead', empty: 'Plan your next conversation', hint: 'No upcoming follow-ups in this view. Schedule one to keep your leads moving.' },
  done: { icon: CheckCheck, description: 'Completed & cancelled', empty: 'No finished follow-ups yet', hint: 'Completed and cancelled follow-ups will appear here with their outcomes.' },
};

type Pending =
  | { kind: 'complete'; item: FollowUp }
  | { kind: 'snooze'; item: FollowUp }
  | { kind: 'reassign'; item: FollowUp }
  | { kind: 'cancel'; item: FollowUp };

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ActionDialog({ pending, onClose, users }: { pending: Pending; onClose: () => void; users: LeadUser[] }) {
  const { t } = useLanguage();
  const action = useFollowUpAction();
  const [text, setText] = useState('');
  const [when, setWhen] = useState(() => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    return toLocalInput(tomorrow);
  });
  const [owner, setOwner] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { item, kind } = pending;
  const run = () => {
    if (action.isPending) return;
    if (kind === 'snooze' && !(new Date(when).getTime() > Date.now())) {
      showError(t('leads.followUps.futureDate', 'Choose a future date and time.'));
      setNow(Date.now());
      return;
    }
    const done = { onSuccess: () => { showSuccess(t('leads.followUps.saved', 'Follow-up updated')); onClose(); }, onError: (err: unknown) => showError(err) };
    if (kind === 'complete') action.mutate({ id: item.id, action: 'complete', body: { note: text.trim() || null } }, done);
    if (kind === 'cancel') action.mutate({ id: item.id, action: 'cancel', body: { reason: text.trim() } }, done);
    if (kind === 'snooze') action.mutate({ id: item.id, action: 'snooze', body: { until: new Date(when).toISOString() } }, done);
    if (kind === 'reassign') action.mutate({ id: item.id, action: 'reassign', body: { ownerId: owner } }, done);
  };
  const invalid = (kind === 'cancel' && !text.trim()) || (kind === 'snooze' && !(when && new Date(when).getTime() > now)) || (kind === 'reassign' && !owner);
  const titles: Record<Pending['kind'], string> = {
    complete: t('leads.followUps.completeTitle', 'Mark follow-up as done'),
    snooze: t('leads.followUps.snoozeTitle', 'Snooze follow-up'),
    reassign: t('leads.followUps.reassignTitle', 'Reassign follow-up'),
    cancel: t('leads.followUps.cancelTitle', 'Cancel follow-up'),
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !action.isPending) onClose(); }}>
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
          <Button variant="ghost" disabled={action.isPending} onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={run} disabled={invalid || action.isPending} className="gap-1.5">
            {action.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {t('leads.followUps.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpRow({ item, locale, tz, t, onAction, canManage }: {
  item: FollowUp; locale: string; tz: string; t: TranslateFn; onAction: (p: Pending) => void; canManage: boolean;
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
    <li className="border-b border-border/60 p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/leads?detail=${item.leadId}`} className="truncate text-sm font-semibold hover:underline">{item.lead.name}</Link>
              {item.lead.leadNumber && <span className="font-mono text-[11px] text-muted-foreground">{item.lead.leadNumber}</span>}
              {item.status === 'done' && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{t('leads.followUps.completed', 'Completed')}</span>}
              {item.status === 'cancelled' && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{t('leads.followUps.cancelled', 'Cancelled')}</span>}
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
              {item.channel && <span>· {t(`leads.followUps.channel.${item.channel}`, CHANNEL_LABELS[item.channel] || item.channel)}</span>}
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
            {item.status === 'done' && item.completedAt && <p className="text-xs text-muted-foreground">{t('leads.followUps.completedAt', 'Completed {date}', { date: formatInZone(item.completedAt, locale, tz) })}</p>}
            {item.status === 'done' && item.completionNote && <p className="text-xs">{item.completionNote}</p>}
            {item.status === 'cancelled' && item.cancelReason && <p className="text-xs text-muted-foreground">{t('leads.followUps.cancelledBecause', 'Cancelled: {reason}', { reason: item.cancelReason })}</p>}
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <Button size="sm" className="gap-1" disabled={blocked || checking} onClick={contact} title={blocked ? t('leads.followUps.blocked', 'Contact blocked') : undefined}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              {blocked ? t('leads.followUps.blocked', 'Contact blocked') : t('leads.followUps.contact', 'Contact')}
            </Button>
            {canManage && <>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onAction({ kind: 'complete', item })}><Check className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.complete', 'Done')}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={t('leads.followUps.moreActions', 'More actions for {lead}', { lead: item.lead.name })}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onAction({ kind: 'snooze', item })}>{t('leads.followUps.snooze', 'Snooze')}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAction({ kind: 'reassign', item })}>{t('leads.followUps.reassign', 'Reassign')}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => onAction({ kind: 'cancel', item })}>{t('leads.followUps.cancel', 'Cancel')}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>}

          </div>
        )}
      </div>
    </li>
  );
}

export function FollowUpInbox() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const user = useAuthStore((state) => state.user) as { id?: string; _id?: string } | null;
  const viewerId = user?.id ?? user?._id;
  const canWrite = hasPermission('lead:write');
  const canAll = hasPermission('lead:assign-policy');
  const [tz] = useState(() => viewerTimezone());
  const [scope, setScope] = useState<FollowUpScope>('mine');
  const [bucket, setBucket] = useState<InboxBucket>('overdue');
  const [pending, setPending] = useState<Pending | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [ownerId, setOwnerId] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  useLeadWorkflowRealtime();
  const summary = useFollowUpSummary(scope, tz);
  const list = useFollowUps({ scope, bucket, tz, q: search || undefined, channel: channel || undefined, ownerId: ownerId || undefined });
  const users = (useWorkspaceUsers().data ?? []) as LeadUser[];
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = Boolean(query.trim() || channel || ownerId);
  const details = BUCKET_DETAILS[bucket];
  const EmptyIcon = details.icon;
  const refresh = () => { void list.refetch(); void summary.refetch(); };
  const reset = () => { setQuery(''); setSearch(''); setChannel(''); setOwnerId(''); };
  const selectClass = 'h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="h-full overflow-y-auto bg-background/40">
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="space-y-2">
            <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />{t('leads.followUps.backToLeads', 'Back to leads')}</Link>
            <h1 className="text-2xl font-semibold tracking-tight">{t('leads.followUps.title', 'Follow-ups')}</h1>
            <p className="text-sm text-muted-foreground">{t('leads.followUps.intro', 'Keep every conversation moving. See what’s due and plan your next step.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:pt-6">
            <label className="sr-only" htmlFor="fu-scope">{t('leads.followUps.scope', 'Whose follow-ups')}</label>
            <select id="fu-scope" className={selectClass} value={scope} onChange={(e) => { setScope(e.target.value as FollowUpScope); setOwnerId(''); }}>
              <option value="mine">{t('leads.followUps.scope.mine', 'Mine')}</option>
              <option value="team">{t('leads.followUps.scope.team', 'My team')}</option>
              {canAll && <option value="all">{t('leads.followUps.scope.all', 'Everyone')}</option>}
            </select>
            {canWrite && <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" aria-hidden="true" />{t('leads.followUps.new', 'New follow-up')}</Button>}
          </div>
        </header>

        <div role="tablist" aria-label={t('leads.followUps.buckets', 'Follow-up buckets')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {BUCKETS.map((b, index) => {
            const Icon = BUCKET_DETAILS[b.key].icon;
            return <button key={b.key} id={`fu-tab-${b.key}`} role="tab" type="button" aria-selected={bucket === b.key} aria-controls="fu-panel" tabIndex={bucket === b.key ? 0 : -1}
              onClick={() => setBucket(b.key)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === 'ArrowRight') next = (index + 1) % BUCKETS.length;
                else if (event.key === 'ArrowLeft') next = (index + BUCKETS.length - 1) % BUCKETS.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = BUCKETS.length - 1;
                else return;
                event.preventDefault(); setBucket(BUCKETS[next].key); document.getElementById(`fu-tab-${BUCKETS[next].key}`)?.focus();
              }}
              className={cn('group rounded-xl border bg-card p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5', bucket === b.key ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/40')}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{t(`leads.followUps.bucket.${b.key}`, b.fallback)}</span><Icon className={cn('h-4 w-4', b.key === 'overdue' ? 'text-destructive' : bucket === b.key ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" /></div>
              <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{summary.isError || !summary.data ? '—' : summary.data[b.key]}</div>
              <p className="mt-1 text-xs text-muted-foreground">{t(`leads.followUps.description.${b.key}`, BUCKET_DETAILS[b.key].description)}</p>
            </button>;
          })}
        </div>
        {summary.isError && <p role="alert" className="text-sm text-destructive">{t('leads.followUps.summaryError', 'Counts could not be loaded.')} <button type="button" className="underline" onClick={() => void summary.refetch()}>{t('common.retry', 'Retry')}</button></p>}

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-col justify-between gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:px-5">
            <div><h2 className="text-base font-semibold">{t(`leads.followUps.bucket.${bucket}`, BUCKETS.find((b) => b.key === bucket)?.fallback)}</h2><p className="mt-1 text-xs text-muted-foreground">{bucket === 'done' ? t('leads.followUps.closedOrder', 'Most recently finished first') : t('leads.followUps.dueOrder', 'Earliest due first')}</p></div>
            <div className="flex items-center gap-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Globe2 className="h-3.5 w-3.5" aria-hidden="true" />{tz}</span><Button variant="ghost" size="icon-sm" onClick={refresh} disabled={list.isFetching || summary.isFetching} aria-label={t('leads.followUps.refresh', 'Refresh follow-ups')}><RefreshCw className={cn('h-4 w-4', (list.isFetching || summary.isFetching) && 'animate-spin')} aria-hidden="true" /></Button></div>
          </div>
          <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 sm:flex-row sm:flex-wrap sm:px-5">
            <div className="relative min-w-0 flex-1 sm:min-w-56"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input type="search" maxLength={200} aria-label={t('leads.followUps.search', 'Search follow-ups')} placeholder={t('leads.followUps.searchPlaceholder', 'Search leads, numbers or notes…')} value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 bg-background ps-9" /></div>
            <select className={selectClass} aria-label={t('leads.followUps.channel', 'Channel')} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">{t('leads.followUps.allChannels', 'All channels')}</option>{FOLLOW_UP_CHANNELS.map((key) => <option key={key} value={key}>{t(`leads.followUps.channel.${key}`, CHANNEL_LABELS[key])}</option>)}</select>
            {scope !== 'mine' && <select className={selectClass} aria-label={t('leads.followUps.owner', 'Owner')} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">{t('leads.followUps.allOwners', 'All owners')}</option>{users.map((u) => <option key={u.id} value={u.id}>{getUserDisplayName(u) || u.id}</option>)}</select>}
            {filtered && <Button variant="ghost" size="sm" onClick={reset}><X className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.clearFilters', 'Clear filters')}</Button>}
          </div>
          <div id="fu-panel" role="tabpanel" aria-labelledby={`fu-tab-${bucket}`} tabIndex={0} aria-busy={list.isFetching}>
            {list.isLoading ? <div role="status" className="space-y-4 p-5"><span className="sr-only">{t('common.loading', 'Loading…')}</span>{[0, 1, 2].map((n) => <div key={n} className="skeleton-shimmer h-20 rounded-lg bg-muted" aria-hidden="true" />)}</div>
              : list.isError ? <div role="alert" className="flex flex-col items-center gap-3 px-5 py-16"><p className="text-sm text-destructive">{t('leads.followUps.loadError', 'Follow-ups could not be loaded. Retry')}</p><Button variant="outline" onClick={() => void list.refetch()}>{t('common.retry', 'Retry')}</Button></div>
              : items.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{filtered ? <Search className="h-6 w-6" aria-hidden="true" /> : <EmptyIcon className="h-6 w-6" aria-hidden="true" />}</div><h3 className="text-lg font-semibold">{filtered ? t('leads.followUps.noMatches', 'No matching follow-ups') : t(`leads.followUps.emptyTitle.${bucket}`, details.empty)}</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{filtered ? t('leads.followUps.noMatchesHint', 'Try a different search or clear your filters to see more follow-ups.') : t(`leads.followUps.emptyHint.${bucket}`, details.hint)}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{filtered ? <Button variant="outline" onClick={reset}>{t('leads.followUps.clearFilters', 'Clear filters')}</Button> : <>{canWrite && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t('leads.followUps.new', 'New follow-up')}</Button>}{bucket === 'overdue' && <Button variant="outline" onClick={() => setBucket('today')}>{t('leads.followUps.viewToday', 'View today')}<ChevronDown className="h-3.5 w-3.5 -rotate-90 rtl:rotate-90" aria-hidden="true" /></Button>}</>}</div></div>
              : <ul>{items.map((item) => <FollowUpRow key={item.id} item={item} locale={locale} tz={tz} t={t} onAction={setPending} canManage={canWrite && (canAll || item.owner.id === viewerId || Boolean(viewerId && item.createdBy === viewerId))} />)}</ul>}
          </div>
          {!list.isLoading && !list.isError && items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3"><p role="status" className="text-xs text-muted-foreground">{list.hasNextPage ? t('leads.followUps.loaded', '{count} follow-ups loaded', { count: items.length }) : t('leads.followUps.showing', 'Showing {count} follow-ups', { count: items.length })}</p>{list.hasNextPage && <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t('leads.followUps.loadMore', 'Load more follow-ups')}</Button>}</div>}
        </section>
        <p className="text-xs leading-5 text-muted-foreground">{t('leads.followUps.subtitle', 'Times are shown in your timezone ({tz}) and, where recorded, in the timezone the follow-up was planned in.', { tz })}</p>
        {pending && <ActionDialog key={`${pending.item.id}-${pending.kind}`} pending={pending} onClose={() => setPending(null)} users={users} />}
        {creating && <CreateFollowUpDialog users={users} tz={tz} onClose={() => setCreating(false)} onCreated={(date) => { setCreating(false); reset(); const endOfToday = new Date(); endOfToday.setHours(24, 0, 0, 0); setBucket(new Date(date) < endOfToday ? 'today' : 'upcoming'); }} />}
      </div>
    </div>
  );
}
