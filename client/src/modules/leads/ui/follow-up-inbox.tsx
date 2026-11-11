'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlarmClock, Bot, CalendarClock, Check, CheckCheck, ChevronDown, Clock3, Globe2, Info, Loader2, Mail, MessageCircle, MessageSquare, MoreHorizontal, PanelRightOpen, Phone, Plus, RefreshCw, Search, ShieldOff, UserRound, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton } from '@/shared/components/page-hero';
import { showError, showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useWorkspaceUsers } from '@/modules/tasks/hooks/use-workspace-users';
import {
  useFollowUpAction, useFollowUpAutomationSettings, useFollowUps, useFollowUpSummary, useLeadWorkflowRealtime, viewerTimezone,
} from '../hooks/use-lead-workflow';
import { leadWorkflowApi } from '../services/lead-workflow-api';
import type { FollowUp, FollowUpBucket, FollowUpManagement, FollowUpScope, FollowUpSummary } from '../types/lead-workflow-types';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea, useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { getUserDisplayName } from './lead-ui-utils';
import type { LeadUser } from './lead-ui-utils';
import { useAuthStore } from '@/stores/auth-store';
import { CreateFollowUpDialog, FOLLOW_UP_CHANNELS, CHANNEL_LABELS } from './create-follow-up-dialog';
import { LeadOutreachComposer } from './lead-outreach-composer';
import { LeadCallLifecycle } from './lead-call-lifecycle';
import { leadApi } from '../services/lead-api';
import type { Lead } from '../types/lead-types';
import { FollowUpAiSummary, MANAGEMENT_OPTIONS } from './follow-up-ai';
import { FollowUpDetailDrawer } from './follow-up-detail-drawer';
import { formatInZone } from './follow-up-format';

export { formatInZone };

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

/** AI follow-up call metrics of GET /crm/follow-ups/summary. */
const AI_METRICS: { key: keyof FollowUpSummary; fallback: string; tone?: string }[] = [
  { key: 'aiScheduled', fallback: 'Scheduled AI calls' },
  { key: 'aiInProgress', fallback: 'Calls in progress' },
  { key: 'aiCompleted', fallback: 'AI calls completed' },
  { key: 'aiFailed', fallback: 'Failed / unanswered', tone: 'text-rose-600 dark:text-rose-300' },
  { key: 'attention', fallback: 'Requires attention', tone: 'text-orange-600 dark:text-orange-300' },
];

/** Completed / failed AI calls close their follow-up, so they only exist in the Done bucket. */
const CLOSED_MANAGEMENT: FollowUpManagement[] = ['ai_completed', 'ai_failed'];

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

function FollowUpRow({ item, locale, tz, t, onAction, canManage, selected, onSelect, onDetails }: {
  item: FollowUp; locale: string; tz: string; t: TranslateFn; onAction: (p: Pending) => void; canManage: boolean;
  selected: boolean; onSelect: () => void; onDetails: () => void;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [emailLead, setEmailLead] = useState<Lead | null>(null);
  const { hasPermission } = usePermissions();
  const canEmail = hasPermission('crm:write');
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
  const composeEmail = async () => {
    setChecking(true);
    try {
      await leadWorkflowApi.contactCheck(item.id, 'email');
      setEmailLead(await leadApi.getLead(item.leadId));
    } catch (err) { showError(err); }
    finally { setChecking(false); }
  };

  return (
    <li className="border-b border-border/60 p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {canManage && open && <input type="checkbox" className="mt-3 h-4 w-4 accent-primary" checked={selected} onChange={onSelect} aria-label={t('leads.followUps.select', 'Select {lead}', { lead: item.lead.name })} />}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/leads?detail=${item.leadId}`} className="truncate text-sm font-semibold hover:underline">{item.lead.name}</Link>
              {item.lead.leadNumber && <span className="font-mono text-[11px] text-muted-foreground">{item.lead.leadNumber}</span>}
              {item.lead.status && <span className="rounded-md border border-border px-2 py-0.5 text-[11px] capitalize">{t(`leads.status.${item.lead.status}`, item.lead.status.replace(/_/g, ' '))}</span>}
              {item.priority && item.priority !== 'NORMAL' && <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] capitalize">{t(`leads.followUps.priority.${item.priority}`, item.priority.toLowerCase())}</span>}
              {item.status === 'done' && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{t('leads.followUps.completed', 'Completed')}</span>}
              {item.status === 'cancelled' && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{t('leads.followUps.cancelled', 'Cancelled')}</span>}
              {item.status === 'snoozed' && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{t('leads.followUps.snoozed', 'Snoozed')}</span>}
              {item.bucket === 'overdue' && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">{t('leads.followUps.bucket.overdue', 'Overdue')}</span>}
            </div>
            <FollowUpAiSummary item={item} t={t} />
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
            {(item.lead.email || item.lead.phone) && <p className="text-xs text-muted-foreground">{[item.lead.email, item.lead.phone].filter(Boolean).join(' · ')}</p>}
            <LeadCallLifecycle value={item.lead.latestCall} />
            {(item.lead.lastContactedAt || item.lead.latestCall?.evaluatedAt) && <p className="text-xs text-muted-foreground">{t('leads.followUps.lastInteraction', 'Last interaction')}: {formatInZone(item.lead.lastContactedAt || item.lead.latestCall?.evaluatedAt || null, locale, tz)}{item.lead.lastContactChannel ? ` · ${t(`leads.followUps.channel.${item.lead.lastContactChannel}`, CHANNEL_LABELS[item.lead.lastContactChannel] || item.lead.lastContactChannel)}` : ''}</p>}
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
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          {open && <>
            {canEmail && <Button size="sm" variant="outline" disabled={checking || !item.lead.email} onClick={composeEmail} title={!item.lead.email ? t('leads.followUps.missingEmail', 'Add an email address in the lead profile') : undefined}><Mail className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.email', 'Email')}</Button>}
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
          </>}
          <Button size="sm" variant="ghost" className="gap-1" onClick={onDetails} aria-label={t('leads.followUps.ai.detailsFor', 'Details for {lead}', { lead: item.lead.name })}>
            <PanelRightOpen className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />{t('leads.followUps.ai.details', 'Details')}
          </Button>
        </div>
      </div>
      {emailLead && <LeadOutreachComposer open leads={[emailLead]} defaultChannel="email" onOpenChange={(value) => { if (!value) setEmailLead(null); }} onComplete={() => setEmailLead(null)} />}
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
  const canAiRead = hasPermission('ai-calling:read');
  const canAiWrite = hasPermission('ai-calling:write');
  const isSupervisor = canAll || hasPermission('ai-calling:admin');
  const [tz] = useState(() => viewerTimezone());
  const [scope, setScope] = useState<FollowUpScope>('mine');
  const [bucket, setBucket] = useState<InboxBucket>('overdue');
  const [pending, setPending] = useState<Pending | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [qualification, setQualification] = useState('');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [management, setManagement] = useState<FollowUpManagement | ''>('');
  // Snapshot of the opened row: the panel stays open (and live) if a change moves it out of this view.
  const [detail, setDetail] = useState<FollowUp | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<'complete' | 'cancel' | null>(null);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkGuard = useRef(false);
  const bulkAction = useFollowUpAction();
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  useLeadWorkflowRealtime();
  const summary = useFollowUpSummary(scope, tz);
  const automation = useFollowUpAutomationSettings(canAiRead);
  const list = useFollowUps({ scope, bucket, tz, q: search || undefined, channel: channel || undefined, ownerId: ownerId || undefined, qualification: qualification || undefined, order, management: management || undefined });
  const users = (useWorkspaceUsers().data ?? []) as LeadUser[];
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const isMine = (item: FollowUp) => Boolean(viewerId) && (item.owner.id === viewerId || item.createdBy === viewerId);
  const canManage = (item: FollowUp) => canWrite && (canAll || isMine(item));
  const selectedItems = items.filter((item) => selected.has(item.id) && canManage(item) && ['open', 'snoozed'].includes(item.status));
  const runBulk = async () => {
    if (!bulkKind || bulkGuard.current || !selectedItems.length) return;
    bulkGuard.current = true; setBulkBusy(true);
    const results = await Promise.allSettled(selectedItems.map((item) => bulkAction.mutateAsync(
      bulkKind === 'complete' ? { id: item.id, action: 'complete', body: { note: bulkNote.trim() || null } }
        : { id: item.id, action: 'cancel', body: { reason: bulkNote.trim() } },
    )));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) showError(t('leads.followUps.bulkFailed', '{count} activities could not be updated. Refresh and retry.', { count: failed.length }));
    else showSuccess(t('leads.followUps.saved', 'Follow-up updated'));
    setSelected(new Set()); setBulkKind(null); setBulkNote(''); setBulkBusy(false); bulkGuard.current = false;
  };
  const filtered = Boolean(query.trim() || channel || ownerId || qualification || management);
  const details = BUCKET_DETAILS[bucket];
  const EmptyIcon = details.icon;
  const refresh = () => { void list.refetch(); void summary.refetch(); };
  const reset = () => { setQuery(''); setSearch(''); setChannel(''); setOwnerId(''); setQualification(''); setManagement(''); };
  const changeManagement = (value: FollowUpManagement | '') => {
    setManagement(value);
    if (value && CLOSED_MANAGEMENT.includes(value)) setBucket('done');
  };
  const settings = automation.data ?? null;
  const metric = (key: keyof FollowUpSummary) => (summary.data && !summary.isError ? summary.data[key] : '—');
  const selectClass = 'h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="h-full overflow-y-auto bg-background/40">
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHero
          id="follow-ups-title"
          art="/hero/followups"
          icon={CalendarClock}
          back={{ href: '/leads', label: t('leads.followUps.backToLeads', 'Back to leads') }}
          eyebrow={t('leads.followUps.title', 'Follow-ups')}
          title={t('hero.followUps.title', 'Every promise kept, right on time.')}
          subtitle={t('leads.followUps.intro', 'Keep every conversation moving. See what’s due and plan your next step.')}
          status={summary.data && !summary.isError ? (
            <HeroPill tone={summary.data.overdue ? 'warn' : 'ok'} onClick={() => setBucket(summary.data?.overdue ? 'overdue' : 'today')}>
              {summary.data.overdue ? t('hero.followUps.overdue', '{count} overdue', { count: summary.data.overdue }) : t('hero.followUps.onTrack', 'Nothing overdue')}
            </HeroPill>
          ) : null}
          actions={<>
            <label className="sr-only" htmlFor="fu-scope">{t('leads.followUps.scope', 'Whose follow-ups')}</label>
            <select id="fu-scope" className={cn(heroButton.ghost, 'appearance-none pe-9 [&>option]:text-foreground')} style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2367e8f9%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.9rem center' }} value={scope} onChange={(e) => { setScope(e.target.value as FollowUpScope); setOwnerId(''); }}>
              <option value="mine">{t('leads.followUps.scope.mine', 'Mine')}</option>
              <option value="team">{t('leads.followUps.scope.team', 'My team')}</option>
              {canAll && <option value="all">{t('leads.followUps.scope.all', 'Everyone')}</option>}
            </select>
            {canWrite && <button type="button" className={heroButton.primary} onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t('leads.followUps.new', 'New follow-up')}</button>}
          </>}
          stats={<>
            <HeroStat icon={UserRound} label={t('leads.followUps.metric.totalLeads', 'Follow-up leads')} value={metric('totalLeads')} hint={t('hero.followUps.pending', '{count} pending activities', { count: metric('pending') })} loading={summary.isLoading} />
            <HeroStat icon={CheckCheck} tone="text-emerald-300" label={t('leads.followUps.metric.qualifiedLeads', 'Qualified leads')} value={metric('qualifiedLeads')} hint={t('hero.followUps.completed', '{count} completed', { count: metric('completed') })} loading={summary.isLoading} />
            <HeroStat icon={Mail} tone="text-cyan-300" label={t('leads.followUps.metric.emailsSent', 'Emails sent')} value={metric('emailsSent')} hint={t('hero.followUps.emails', '{delivered} delivered · {failed} failed', { delivered: metric('emailsDelivered'), failed: metric('emailsFailed') })} loading={summary.isLoading} />
            <HeroStat icon={Bot} tone="text-sky-200" label={t('leads.followUps.ai.metricsTitle', 'AI follow-up calls')} value={metric('aiManaged')} hint={t('hero.followUps.ai', '{count} need attention', { count: metric('attention') })} loading={summary.isLoading} />
          </>}
        />

        {canAiRead && settings && (!settings.enabled || settings.voicePaused) && (
          <div role="status" className="flex flex-col gap-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500 dark:text-sky-300" aria-hidden="true" />
              <span>
                {settings.voicePaused
                  ? t('leads.followUps.ai.bannerVoicePaused', 'AI voice calling is paused — no AI follow-up calls are placed, including “Call now”, until it is resumed on the AI Calling page.')
                  : settings.forcedOffByEnv
                    ? t('leads.followUps.ai.bannerForcedOff', 'Automatic AI follow-up calls are turned off by the server configuration — AI follow-ups wait; “Call now” still works.')
                    : t('leads.followUps.ai.bannerOff', 'Automatic AI follow-up calls are off — AI follow-ups wait until an admin turns automation on; “Call now” still works.')}
                {!settings.voicePaused && settings.pausedReason && <span className="text-muted-foreground"> {t('leads.followUps.ai.bannerReason', 'Reason: {reason}', { reason: settings.pausedReason })}</span>}
              </span>
            </p>
            <Link href="/ai-calling" className="shrink-0 text-xs font-medium text-blue-700 hover:underline dark:text-sky-300">{t('leads.followUps.ai.openAiCalling', 'Open AI Calling')}</Link>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)]">
        <section aria-labelledby="fu-ai-metrics" className="flex flex-col gap-3 bg-gradient-to-r from-blue-600/[0.04] via-transparent to-cyan-500/[0.05] px-4 py-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-2 px-2 lg:w-48">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 text-white" aria-hidden="true"><Bot className="h-3.5 w-3.5" /></span>
            <div className="min-w-0">
              <h2 id="fu-ai-metrics" className="text-xs font-semibold">{t('leads.followUps.ai.metricsTitle', 'AI follow-up calls')}</h2>
              <p className="text-[11px] text-muted-foreground">{t('leads.followUps.ai.metricsManaged', '{count} open AI-managed', { count: metric('aiManaged') })}</p>
            </div>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
            {AI_METRICS.map(({ key, fallback, tone }) => (
              <div key={key} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1 sm:block">
                <dt className="text-[11px] text-muted-foreground">{t(`leads.followUps.ai.metric.${key}`, fallback)}</dt>
                <dd className={cn('text-base font-semibold tabular-nums', typeof metric(key) === 'number' && (metric(key) as number) > 0 && tone)}>{metric(key)}</dd>
              </div>
            ))}
          </dl>
        </section>
        </div>

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
            <select className={selectClass} aria-label={t('leads.followUps.ai.management', 'Managed by')} value={management} onChange={(e) => changeManagement(e.target.value as FollowUpManagement | '')}>{MANAGEMENT_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{t(`leads.followUps.ai.management.${option.value || 'all'}`, option.fallback)}</option>)}</select>
            <select className={selectClass} aria-label={t('leads.followUps.channel', 'Channel')} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">{t('leads.followUps.allChannels', 'All channels')}</option>{FOLLOW_UP_CHANNELS.map((key) => <option key={key} value={key}>{t(`leads.followUps.channel.${key}`, CHANNEL_LABELS[key])}</option>)}</select>
            <select className={selectClass} aria-label={t('leads.followUps.qualification', 'Qualification')} value={qualification} onChange={(event) => setQualification(event.target.value)}><option value="">{t('leads.followUps.allQualifications', 'All qualification results')}</option>{['QUALIFIED', 'PARTIALLY_QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK_REQUIRED', 'NOT_INTERESTED', 'UNRESPONSIVE'].map((value) => <option key={value} value={value}>{t(`leads.lifecycle.${value}`, value.replace(/_/g, ' ').toLowerCase())}</option>)}</select>
            <select className={selectClass} aria-label={t('leads.followUps.sort', 'Sort by due date')} value={order} onChange={(event) => setOrder(event.target.value as 'asc' | 'desc')}><option value="asc">{t('leads.followUps.earliestFirst', 'Earliest first')}</option><option value="desc">{t('leads.followUps.latestFirst', 'Latest first')}</option></select>
            {scope !== 'mine' && <select className={selectClass} aria-label={t('leads.followUps.owner', 'Owner')} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">{t('leads.followUps.allOwners', 'All owners')}</option>{users.map((u) => <option key={u.id} value={u.id}>{getUserDisplayName(u) || u.id}</option>)}</select>}
            {filtered && <Button variant="ghost" size="sm" onClick={reset}><X className="h-3.5 w-3.5" aria-hidden="true" />{t('leads.followUps.clearFilters', 'Clear filters')}</Button>}
          </div>
          <div id="fu-panel" role="tabpanel" aria-labelledby={`fu-tab-${bucket}`} tabIndex={0} aria-busy={list.isFetching}>
            {selectedItems.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-5 py-3"><span className="text-sm">{t('leads.followUps.selected', '{count} selected', { count: selectedItems.length })}</span><Button size="sm" variant="outline" onClick={() => setBulkKind('complete')}>{t('leads.followUps.bulkComplete', 'Complete selected')}</Button><Button size="sm" variant="outline" onClick={() => setBulkKind('cancel')}>{t('leads.followUps.bulkCancel', 'Cancel selected')}</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('leads.followUps.clearSelection', 'Clear selection')}</Button></div>}
            {list.isLoading ? <div role="status" className="space-y-4 p-5"><span className="sr-only">{t('common.loading', 'Loading…')}</span>{[0, 1, 2].map((n) => <div key={n} className="skeleton-shimmer h-20 rounded-lg bg-muted" aria-hidden="true" />)}</div>
              : list.isError ? <div role="alert" className="flex flex-col items-center gap-3 px-5 py-16"><p className="text-sm text-destructive">{t('leads.followUps.loadError', 'Follow-ups could not be loaded. Retry')}</p><Button variant="outline" onClick={() => void list.refetch()}>{t('common.retry', 'Retry')}</Button></div>
              : items.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">{filtered ? <Search className="h-6 w-6" aria-hidden="true" /> : <EmptyIcon className="h-6 w-6" aria-hidden="true" />}</div><h3 className="text-lg font-semibold">{filtered ? t('leads.followUps.noMatches', 'No matching follow-ups') : t(`leads.followUps.emptyTitle.${bucket}`, details.empty)}</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{filtered ? t('leads.followUps.noMatchesHint', 'Try a different search or clear your filters to see more follow-ups.') : t(`leads.followUps.emptyHint.${bucket}`, details.hint)}</p><div className="mt-6 flex flex-wrap justify-center gap-2">{filtered ? <Button variant="outline" onClick={reset}>{t('leads.followUps.clearFilters', 'Clear filters')}</Button> : <>{canWrite && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t('leads.followUps.new', 'New follow-up')}</Button>}{bucket === 'overdue' && <Button variant="outline" onClick={() => setBucket('today')}>{t('leads.followUps.viewToday', 'View today')}<ChevronDown className="h-3.5 w-3.5 -rotate-90 rtl:rotate-90" aria-hidden="true" /></Button>}</>}</div></div>
              : <ul>{items.map((item) => <FollowUpRow key={item.id} item={item} locale={locale} tz={tz} t={t} onAction={setPending} canManage={canManage(item)} selected={selected.has(item.id)} onDetails={() => { setDetail(item); setDetailOpen(true); }} onSelect={() => setSelected((previous) => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />)}</ul>}
          </div>
          {!list.isLoading && !list.isError && items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3"><p role="status" className="text-xs text-muted-foreground">{list.hasNextPage ? t('leads.followUps.loaded', '{count} follow-ups loaded', { count: items.length }) : t('leads.followUps.showing', 'Showing {count} follow-ups', { count: items.length })}</p>{list.hasNextPage && <Button variant="outline" size="sm" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}{t('leads.followUps.loadMore', 'Load more follow-ups')}</Button>}</div>}
        </section>
        <p className="text-xs leading-5 text-muted-foreground">{t('leads.followUps.subtitle', 'Times are shown in your timezone ({tz}) and, where recorded, in the timezone the follow-up was planned in.', { tz })}</p>
        {detail && <FollowUpDetailDrawer key={detail.id} item={items.find((row) => row.id === detail.id) ?? detail} open={detailOpen} onOpenChange={setDetailOpen}
          locale={locale} tz={tz} users={users} canManage={canManage(detail)} canAiRead={canAiRead} canAiWrite={canAiWrite} isMine={isMine(detail)} isSupervisor={isSupervisor}
          settings={canAiRead ? settings : null} onLifecycle={(kind, item) => setPending({ kind, item })} />}
        {pending && <ActionDialog key={`${pending.item.id}-${pending.kind}`} pending={pending} onClose={() => setPending(null)} users={users} />}
        {bulkKind && <Dialog open onOpenChange={(value) => { if (!value && !bulkBusy) setBulkKind(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{bulkKind === 'complete' ? t('leads.followUps.bulkComplete', 'Complete selected') : t('leads.followUps.bulkCancel', 'Cancel selected')}</DialogTitle><DialogDescription>{t('leads.followUps.selected', '{count} selected', { count: selectedItems.length })}</DialogDescription></DialogHeader><Label htmlFor="fu-bulk-note">{bulkKind === 'cancel' ? t('leads.followUps.cancelReason', 'Reason (required)') : t('leads.followUps.completeNote', 'Outcome note (optional)')}</Label><Textarea id="fu-bulk-note" maxLength={1000} value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} /><DialogFooter><Button variant="outline" disabled={bulkBusy} onClick={() => setBulkKind(null)}>{t('common.cancel', 'Cancel')}</Button><Button disabled={bulkBusy || !selectedItems.length || (bulkKind === 'cancel' && !bulkNote.trim())} onClick={() => void runBulk()}>{bulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}{t('common.confirm', 'Confirm')}</Button></DialogFooter></DialogContent></Dialog>}
        {creating && <CreateFollowUpDialog users={users} tz={tz} onClose={() => setCreating(false)} onCreated={(date) => { setCreating(false); reset(); const endOfToday = new Date(); endOfToday.setHours(24, 0, 0, 0); setBucket(new Date(date) < endOfToday ? 'today' : 'upcoming'); }} />}
      </div>
    </div>
  );
}
