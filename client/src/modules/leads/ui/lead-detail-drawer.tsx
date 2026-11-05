'use client';

import { useId, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LeadCallLifecycle } from './lead-call-lifecycle';
import { Tabs } from 'radix-ui';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Bot,
  Building2,
  CalendarClock,
  Clock,
  Compass,
  ExternalLink,
  FilterX,
  Globe,
  Hash,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Star,
  StickyNote,
  Store,
  Tag,
  Trash2,
  User,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FaFacebook, FaInstagram, FaLinkedin, FaTiktok, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import type { IconType } from 'react-icons';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { DetailDrawer } from '@/shared/components/detail-drawer';
import type { DrawerMode } from '@/shared/components/detail-drawer';
import { RatingStars } from './rating-stars';
import { EmailHistoryPanel as EmailHistoryPanelImpl } from '@/modules/doctpl/components/email-history-panel';
import { LeadCallsTab } from '@/modules/aiCalling/ui/lead-calls-tab';
import { LeadAiCalling } from './lead-ai-calling';
import { LeadDetailTabs } from './lead-detail-tabs';
import { LeadMobileCommunications } from './lead-mobile-communications';
import { LeadConversationHistory } from './lead-conversation-history';
import { LeadSlaBadge } from './lead-sla-badge';
import { LeadContactPolicy } from '@/modules/smsOps/ui/lead-contact-policy';
import { AccessReasonGate } from '@/modules/governance/ui/access-reason-gate';
import { LeadPiiReveal } from '@/modules/governance/ui/lead-pii-reveal';
import { LeadAccessHistory } from '@/modules/governance/ui/lead-access-history';
import { isAccessReasonRequired } from '@/modules/governance/services/governance-api';
import { useDeleteLead, useEnrichLead, useLead, useLeadContactLog, useUpdateLead } from '../hooks/use-leads';
import type {
  Lead,
  LeadContactChannel,
  LeadContactLogEntry,
  LeadEnrichmentStatus,
  LeadSocial,
  LeadStatus,
} from '../types/lead-types';
import {
  Button,
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useLanguage,
} from './lead-ui-kit';
import type { TranslateFn } from './lead-ui-kit';
import { LeadOutreachComposer } from './lead-outreach-composer';
import { LeadConsentPanel } from './lead-consent-panel';
import { LeadScorePanel } from './lead-score-panel';
import type { OutreachChannel } from '../services/messaging-api';
import { messagingApi } from '../services/messaging-api';
import {
  LEAD_EDITABLE_STATUSES,
  LEAD_SOURCE_ICON,
  UNASSIGNED,
  getLeadSourceLabel,
  getLeadStatusLabel,
  getLeadTypeLabel,
} from './lead-ui-constants';
import {
  customerHref,
  findUser,
  formatLeadDateTime,
  getAddressLines,
  getLeadBusinessTypeLabel,
  getLeadCreatorName,
  getOpeningHoursLines,
  getUserDisplayName,
  getWebsiteLabel,
  mapsUrlForLead,
  toIntlLocale,
  toMailtoHref,
  toSafeWebUrl,
  toTelHref,
  toWhatsAppHref,
} from './lead-ui-utils';
import { RatingDistribution } from './rating-distribution';
import type { LeadUser } from './lead-ui-utils';
import { LeadForm } from './lead-form-dialog';
import { ConvertDialog } from './convert-dialog';
import { LtrText } from './ltr-text';
import { useDiscardGuard } from './use-discard-guard';
import { LEAD_STATUS_META, LeadStatusBadge } from './status-badge';
import {
  activeHistoryFilterCount,
  buildProviderHistoryParams,
  isHistoryDateRangeValid,
} from './provider-history-filters';

const EmailHistoryPanel = EmailHistoryPanelImpl as unknown as ComponentType<{
  sourceModule?: string;
  sourceRecordId: string;
  highlightId?: string;
}>;

// ── Presentational pieces ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{children}</h3>
      <div className="h-px flex-1 bg-border/50" />
    </div>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

function InfoList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-background/40">
      {children}
    </dl>
  );
}

/**
 * The platform pins a 48px "report a problem" button 24px from the bottom-left
 * of the content area, above sheets. Together with the footer's own 24px padding, 48px more
 * keeps the footer's actions out from under it.
 *
 * The button is positioned physically (always on the left), so the clear space
 * is on the footer's start in LTR but on its end in RTL.
 */
const FOOTER_FAB_CLEARANCE = 'ps-12 rtl:ps-0 rtl:pe-12';

const linkClass =
  'rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function ExternalAnchor({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, 'inline-flex items-center gap-1', className)}>
      {children}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
    </a>
  );
}

function MutedText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground/70">{children}</p>;
}

// ── Communication history (contact log) ───────────────────────────────────────

const CONTACT_CHANNEL_META: Record<LeadContactChannel, { icon: LucideIcon; labelKey: string; fallback: string }> = {
  whatsapp: { icon: MessageCircle, labelKey: 'leads.history.whatsapp', fallback: 'WhatsApp' },
  email: { icon: Mail, labelKey: 'leads.history.email', fallback: 'Email' },
  phone: { icon: Phone, labelKey: 'leads.drawer.phone', fallback: 'Phone' },
  manual: { icon: StickyNote, labelKey: 'leads.action.addNote', fallback: 'Note' },
};

/** Short relative time (e.g. "2 hours ago"), falling back to an absolute date. */
function formatRelativeTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  try {
    const rtf = new Intl.RelativeTimeFormat(toIntlLocale(locale), { numeric: 'auto' });
    if (abs < HOUR) return rtf.format(Math.round(diffMs / MIN), 'minute');
    if (abs < DAY) return rtf.format(Math.round(diffMs / HOUR), 'hour');
    if (abs < DAY * 30) return rtf.format(Math.round(diffMs / DAY), 'day');
  } catch {
    // Intl.RelativeTimeFormat unavailable — fall through to the absolute date.
  }
  return formatLeadDateTime(value, locale);
}

function ContactLog({
  entries,
  loading,
  locale,
  t,
}: {
  entries: LeadContactLogEntry[];
  loading: boolean;
  locale: string;
  t: TranslateFn;
}) {
  if (loading) {
    return <div className="skeleton-shimmer h-12 rounded-xl bg-muted" aria-hidden="true" />;
  }
  if (entries.length === 0) {
    return <MutedText>{t('leads.history.empty', 'No communication logged yet.')}</MutedText>;
  }
  return (
    <ul className="space-y-2" aria-label={t('leads.drawer.sectionHistory', 'Communication')}>
      {entries.map((entry) => {
        const meta = CONTACT_CHANNEL_META[entry.channel] ?? CONTACT_CHANNEL_META.manual;
        const Icon = meta.icon;
        const channelLabel = t(meta.labelKey, meta.fallback);
        const primary = entry.subject || entry.note || channelLabel;
        const secondary = entry.subject && entry.note && entry.note !== entry.subject ? entry.note : null;
        return (
          <li
            key={entry.id}
            className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {channelLabel}
                </span>
                {entry.createdAt && (
                  <span className="text-[11px] text-muted-foreground/70">
                    {formatRelativeTime(entry.createdAt, locale)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 break-words text-sm text-foreground">{primary}</p>
              {secondary && <p className="mt-0.5 break-words text-[13px] text-muted-foreground">{secondary}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ProviderMessageHistory({ leadId, locale, receivedOnly = false }: { leadId: string; locale: string; receivedOnly?: boolean }) {
  const [page, setPage] = useState(1);
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState(receivedOnly ? 'received' : 'all');
  const [provider, setProvider] = useState('all');
  const [campaignId, setCampaignId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dateRangeValid = isHistoryDateRangeValid(from, to);
  const activeFilterCount = activeHistoryFilterCount({ channel: channel as OutreachChannel | 'all', status: receivedOnly ? 'all' : status, provider, campaignId, from, to });
  const campaigns = useQuery({
    queryKey: ['messaging', 'campaigns', 'history-filter'],
    queryFn: () => messagingApi.listCampaigns({ limit: 100 }),
    staleTime: 60_000,
  });
  const query = useQuery({
    queryKey: ['messaging', 'lead-history', leadId, page, channel, status, provider, campaignId, from, to],
    queryFn: () => messagingApi.leadHistoryPage(leadId, buildProviderHistoryParams({
      page, channel: channel as OutreachChannel | 'all', status, provider, campaignId, from, to,
    })),
    enabled: dateRangeValid,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const entries = query.data?.data ?? [];
  const resetFilters = () => {
    setChannel('all');
    setStatus(receivedOnly ? 'received' : 'all');
    setProvider('all');
    setCampaignId('all');
    setFrom('');
    setTo('');
    setPage(1);
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-muted/[0.16] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold">{receivedOnly ? 'Received messages' : 'Provider message evidence'}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{receivedOnly ? 'Replies received from this lead by email, SMS, and WhatsApp.' : 'Filter verified outbound and inbound provider records.'}</p></div>
          <div className="flex items-center gap-2">
            {query.isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Refreshing history" />}
            {activeFilterCount > 0 && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={resetFilters}><FilterX className="h-3.5 w-3.5" /> Clear {activeFilterCount}</Button>}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={channel} onValueChange={(value) => { setChannel(value); setPage(1); }}><SelectTrigger aria-label="History channel" className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select>
          {!receivedOnly && <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger aria-label="History status" className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{['received', 'draft', 'queued', 'submitting', 'accepted', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'unknown', 'suppressed', 'ineligible', 'cancelled'].map((item) => <SelectItem key={item} value={item}><span className="capitalize">{item}</span></SelectItem>)}</SelectContent></Select>}
          <Select value={provider} onValueChange={(value) => { setProvider(value); setPage(1); }}><SelectTrigger aria-label="History provider" className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All providers</SelectItem><SelectItem value="existing_email">Email</SelectItem><SelectItem value="meta_whatsapp">Meta</SelectItem><SelectItem value="textbee">TextBee</SelectItem><SelectItem value="twilio">Twilio</SelectItem><SelectItem value="android_sim">Android SIM</SelectItem></SelectContent></Select>
          <Select value={campaignId} onValueChange={(value) => { setCampaignId(value); setPage(1); }} disabled={campaigns.isLoading}><SelectTrigger aria-label="History campaign" className="h-8 text-xs"><SelectValue placeholder="All campaigns" /></SelectTrigger><SelectContent><SelectItem value="all">All campaigns</SelectItem>{(campaigns.data?.data ?? []).map((campaign) => <SelectItem key={campaign._id} value={campaign._id}>{campaign.name}</SelectItem>)}</SelectContent></Select>
          <Input aria-label="History from date" title="History from date" type="date" className="h-8 text-xs" max={to || undefined} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          <Input aria-label="History to date" title="History to date" type="date" className="h-8 text-xs" min={from || undefined} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </div>
      </div>
      {!dateRangeValid ? <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">The end date must be on or after the start date.</p> : query.isError ? <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2"><p className="text-xs text-destructive">Provider history could not be loaded.</p><Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></div> : query.isLoading ? <div className="skeleton-shimmer h-20 rounded-xl bg-muted" aria-hidden="true" /> : !entries.length ? <MutedText>No provider messages match these filters.</MutedText> : <ul className="space-y-2" aria-label="Provider message history">
      {entries.map((entry) => {
        const Icon = entry.channel === 'email' ? Mail : entry.channel === 'sms' ? Smartphone : MessageCircle;
        const campaign = typeof entry.campaignId === 'object' ? entry.campaignId?.name : null;
        const evidenceAt = entry.readAt || entry.deliveredAt || entry.sentAt || entry.acceptedAt;
        return (
          <li key={entry._id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Icon className="h-3.5 w-3.5 text-primary" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{entry.direction === 'inbound' ? 'Inbound' : 'Outbound'} {entry.channel}</span><span>·</span><span>{entry.provider || 'pending provider'}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 normal-case capitalize text-foreground">{entry.status}</span>
                <span>{formatRelativeTime(entry.createdAt, locale)}</span>
              </div>
              {entry.rendered?.subject && <p dir="auto" className="mt-1 text-sm font-medium text-foreground">{entry.rendered.subject}</p>}
              <details className="mt-1 text-sm text-foreground"><summary className="cursor-pointer truncate">{entry.rendered?.bodyText || 'Message content unavailable'}</summary><p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{entry.rendered?.bodyText || 'Message content unavailable'}</p><dl className="mt-2 space-y-1 text-xs text-muted-foreground"><div><dt>Sent at</dt><dd>{entry.sentAt ? new Date(entry.sentAt).toLocaleString(locale) : 'No sending evidence'}</dd></div><div><dt>Delivered at</dt><dd>{entry.deliveredAt ? new Date(entry.deliveredAt).toLocaleString(locale) : 'No delivery receipt'}</dd></div></dl></details>
              {(campaign || evidenceAt) && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{campaign ? `Campaign: ${campaign}` : 'Direct message'}{evidenceAt ? ` · ${entry.status} ${formatRelativeTime(evidenceAt, locale)}` : ''}</p>}
              {entry.error?.message && <p className="mt-0.5 text-xs text-destructive">{entry.error.message}</p>}
              {entry.providerMessageId && <p dir="ltr" className="mt-0.5 truncate text-start font-mono text-[10px] text-muted-foreground">{entry.providerMessageId}</p>}
            </div>
          </li>
        );
      })}
      </ul>}
      {(query.data?.pagination.pages ?? 0) > 1 && <div className="flex items-center justify-between"><Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted-foreground">Page {page} of {query.data?.pagination.pages}</span><Button size="sm" variant="ghost" disabled={page >= (query.data?.pagination.pages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</Button></div>}
    </div>
  );
}

// Google Places price level → a localized label. The server stores the Places
// (New) string enum (e.g. 'PRICE_LEVEL_MODERATE'); legacy data / imports may use a
// 0–4 number. Known values map to the shared `leadgen.priceLevel.*` keys; an
// unrecognized string is shown raw and null renders nothing.
const PRICE_LEVEL_KEY: Record<string, { key: string; fallback: string }> = {
  PRICE_LEVEL_FREE: { key: 'leadgen.priceLevel.free', fallback: 'Free' },
  PRICE_LEVEL_INEXPENSIVE: { key: 'leadgen.priceLevel.inexpensive', fallback: 'Inexpensive' },
  PRICE_LEVEL_MODERATE: { key: 'leadgen.priceLevel.moderate', fallback: 'Moderate' },
  PRICE_LEVEL_EXPENSIVE: { key: 'leadgen.priceLevel.expensive', fallback: 'Expensive' },
  PRICE_LEVEL_VERY_EXPENSIVE: { key: 'leadgen.priceLevel.veryExpensive', fallback: 'Very expensive' },
  PRICE_LEVEL_UNSPECIFIED: { key: 'leadgen.priceLevel.unknown', fallback: 'Unknown' },
};

const NUMERIC_PRICE_LEVEL: Record<number, { key: string; fallback: string }> = {
  0: PRICE_LEVEL_KEY.PRICE_LEVEL_FREE,
  1: PRICE_LEVEL_KEY.PRICE_LEVEL_INEXPENSIVE,
  2: PRICE_LEVEL_KEY.PRICE_LEVEL_MODERATE,
  3: PRICE_LEVEL_KEY.PRICE_LEVEL_EXPENSIVE,
  4: PRICE_LEVEL_KEY.PRICE_LEVEL_VERY_EXPENSIVE,
};

function getPriceLevelLabel(
  t: (key: string, fallback: string) => string,
  value: number | string | null,
): string | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    const meta = NUMERIC_PRICE_LEVEL[value];
    return meta ? t(meta.key, meta.fallback) : null;
  }
  const meta = PRICE_LEVEL_KEY[value];
  if (meta) return t(meta.key, meta.fallback);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// ── Enrichment + social (website-scraped) ─────────────────────────────────────

// Social platforms → brand glyph + i18n label. Brand icons are not in lucide 1.x,
// so these come from react-icons, styled the same way (currentColor, small box).
const SOCIAL_PLATFORMS: Array<{ key: keyof LeadSocial; icon: IconType; labelKey: string; fallback: string }> = [
  { key: 'linkedin', icon: FaLinkedin, labelKey: 'leads.social.linkedin', fallback: 'LinkedIn' },
  { key: 'facebook', icon: FaFacebook, labelKey: 'leads.social.facebook', fallback: 'Facebook' },
  { key: 'instagram', icon: FaInstagram, labelKey: 'leads.social.instagram', fallback: 'Instagram' },
  { key: 'twitter', icon: FaXTwitter, labelKey: 'leads.social.twitter', fallback: 'X (Twitter)' },
  { key: 'youtube', icon: FaYoutube, labelKey: 'leads.social.youtube', fallback: 'YouTube' },
  { key: 'tiktok', icon: FaTiktok, labelKey: 'leads.social.tiktok', fallback: 'TikTok' },
];

// Enrichment status → icon + label (never colour alone: every state has its own
// icon *and* text). 'pending'/'running' spin; 'done'/'failed'/'none' are static.
const ENRICHMENT_STATUS_META: Record<
  LeadEnrichmentStatus,
  { icon: LucideIcon; labelKey: string; fallback: string; className: string }
> = {
  none: { icon: Globe, labelKey: 'leads.enrich.none', fallback: 'Not enriched', className: 'text-muted-foreground' },
  pending: { icon: Loader2, labelKey: 'leads.enrich.running', fallback: 'Enriching…', className: 'text-muted-foreground' },
  running: { icon: Loader2, labelKey: 'leads.enrich.running', fallback: 'Enriching…', className: 'text-muted-foreground' },
  done: { icon: Sparkles, labelKey: 'leads.enrich.done', fallback: 'Enriched', className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { icon: AlertTriangle, labelKey: 'leads.enrich.failed', fallback: 'Enrichment failed', className: 'text-destructive' },
};

// ── Drawer ───────────────────────────────────────────────────────────────────

type LeadDetailDrawerProps = {
  /** Id from the `?detail=` URL param. */
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users?: LeadUser[];
  /** Step through the list the drawer was opened from (Alt+↑ / Alt+↓). */
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  /** Fired after the lead was deleted from the drawer (the drawer closes itself). */
  onDeleted?: (id: string) => void;
};

export function LeadDetailDrawer({
  leadId,
  open,
  onOpenChange,
  users = [],
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onDeleted,
}: LeadDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const formId = useId();
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission(PERMISSIONS.LEAD_WRITE);
  const canConvert = hasPermission(PERMISSIONS.LEAD_CONVERT);
  const canDelete = hasPermission(PERMISSIONS.LEAD_DELETE);
  const canEmail = hasPermission(PERMISSIONS.CRM_WRITE);
  const canWhatsApp = hasPermission(PERMISSIONS.LEAD_WHATSAPP);
  const canEnrich = hasPermission(PERMISSIONS.LEAD_ENRICH);

  const leadQuery = useLead(open ? leadId : null);
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const lead: Lead | undefined = leadQuery.data;

  const [mode, setMode] = useState<DrawerMode>('view');
  const [formPending, setFormPending] = useState(false);
  const discard = useDiscardGuard();
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [outreach, setOutreach] = useState<{ open: boolean; channel: OutreachChannel }>({ open: false, channel: 'email' });

  // Edit mode belongs to one lead in one opening: reset it whenever either
  // changes (state adjusted during render, no effect needed).
  const [trackedKey, setTrackedKey] = useState(`${open}:${leadId}`);
  const currentKey = `${open}:${leadId}`;
  if (trackedKey !== currentKey) {
    setTrackedKey(currentKey);
    setMode('view');
    setFormPending(false);
    setOutreach((value) => ({ ...value, open: false }));
  }

  const isConverted = lead?.status === 'converted';
  const isEditing = mode === 'edit' && Boolean(lead) && canWrite;

  const patchLead = (patch: { status?: LeadStatus; assignedTo?: string | null }) => {
    if (lead) updateLead.mutate({ id: lead.id, patch });
  };

  const handleDelete = () => {
    if (!lead) return;
    setDeleteOpen(false);
    // Close first: with the drawer closed nothing observes the lead any more,
    // so removing its cache entry cannot trigger a refetch of a deleted id.
    onOpenChange(false);
    deleteLead.mutate(lead.id, { onSuccess: () => onDeleted?.(lead.id) });
  };

  const title = lead
    ? lead.name
    : leadQuery.isError
      ? t('leads.drawer.notFound', 'Lead not found')
      : t('leads.drawer.loading', 'Loading lead…');
  const subtitle = lead
    ? [lead.leadNumber, getLeadTypeLabel(t, lead.type)].filter(Boolean).join(' · ')
    : undefined;

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: ReactNode;
  if (!lead && leadQuery.isError && leadId && isAccessReasonRequired(leadQuery.error)) {
    // Governance (team mode): a lead the viewer does not own needs a stated reason.
    body = <AccessReasonGate leadId={leadId} onGranted={() => void leadQuery.refetch()} onCancel={() => onOpenChange(false)} />;
  } else if (!lead && leadQuery.isError) {
    body = (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-6 w-6 text-warning" aria-hidden="true" />
        <p className="max-w-xs text-sm text-muted-foreground">
          {t('leads.drawer.errorBody', 'This lead could not be loaded. It may have been deleted.')}
        </p>
        <Button variant="outline" size="sm" onClick={() => void leadQuery.refetch()}>
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  } else if (!lead) {
    body = (
      <div className="space-y-4" aria-busy="true" aria-label={t('leads.drawer.loading', 'Loading lead…')}>
        <div className="skeleton-shimmer h-7 w-1/3 rounded-full bg-muted" />
        <div className="skeleton-shimmer h-24 rounded-xl bg-muted" />
        <div className="skeleton-shimmer h-32 rounded-xl bg-muted" />
        <div className="skeleton-shimmer h-24 rounded-xl bg-muted" />
      </div>
    );
  } else if (isEditing) {
    body = (
      <LeadForm
        key={lead.id}
        lead={lead}
        formId={formId}
        users={users}
        onPendingChange={setFormPending}
        onDirtyChange={discard.setDirty}
        onUnchanged={() => setMode('view')}
        onSaved={() => setMode('view')}
      />
    );
  } else {
    body = (
      <LeadDetailBody
        key={lead.id}
        lead={lead}
        users={users}
        locale={locale}
        canWrite={canWrite}
        canEmail={canEmail}
        canWhatsApp={canWhatsApp}
        canEnrich={canEnrich}
        onEmail={() => setOutreach({ open: true, channel: 'email' })}
        onSms={() => setOutreach({ open: true, channel: 'sms' })}
        onWhatsApp={() => setOutreach({ open: true, channel: 'whatsapp' })}
        onPatch={patchLead}
      />
    );
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  let footer: ReactNode = null;
  if (lead && isEditing) {
    footer = (
      <div className={cn('flex flex-wrap items-center justify-end gap-2', FOOTER_FAB_CLEARANCE)}>
        <Button variant="outline" onClick={() => setMode('view')} disabled={formPending}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button type="submit" form={formId} disabled={formPending} className="gap-2">
          {formPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('common.save', 'Save')}
        </Button>
      </div>
    );
  } else if (lead && (canDelete || canWrite || (canConvert && !isConverted))) {
    footer = (
      <div className={cn('flex flex-wrap items-center gap-2', FOOTER_FAB_CLEARANCE)}>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t('common.delete', 'Delete')}
          </Button>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMode('edit')}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.edit', 'Edit')}
            </Button>
          )}
          {canConvert && !isConverted && (
            <Button size="sm" className="gap-1.5" onClick={() => setConvertOpen(true)}>
              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t('leads.action.convert', 'Convert to customer')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Everything that would drop half-typed edits (Escape, overlay click, the
          view toggle, stepping to another lead) asks first. */}
      <DetailDrawer
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : discard.guard(() => onOpenChange(false)))}
        title={title}
        subtitle={subtitle}
        onPrevious={onPrevious ? () => discard.guard(onPrevious) : undefined}
        onNext={onNext ? () => discard.guard(onNext) : undefined}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        mode={isEditing ? 'edit' : 'view'}
        onModeChange={
          canWrite && lead
            ? (next) => (next === 'view' ? discard.guard(() => setMode('view')) : setMode(next))
            : undefined
        }
        enableEditMode={canWrite && Boolean(lead)}
        size="lg"
        footer={footer}
      >
        {body}
      </DetailDrawer>

      {discard.dialog}

      <ConvertDialog
        lead={lead ?? null}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        users={users}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('leads.delete.title', 'Delete this lead?')}
        description={t('leads.delete.description', '“{name}” will be removed from your pipeline. This action cannot be undone.', {
          name: lead?.name ?? '',
        })}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        onConfirm={handleDelete}
      />

      {/* Single-lead contact uses the same consent-aware provider pipeline as
          bulk outreach; it never opens WhatsApp Web or claims delivery. */}
      {lead && (
        <LeadOutreachComposer
          open={outreach.open}
          leads={[lead]}
          defaultChannel={outreach.channel}
          totalMatching={1}
          onOpenChange={(next) => setOutreach((value) => ({ ...value, open: next }))}
        />
      )}
    </>
  );
}

// ── Read-only view ───────────────────────────────────────────────────────────

type LeadDetailBodyProps = {
  lead: Lead;
  users: LeadUser[];
  locale: string;
  canWrite: boolean;
  canEmail: boolean;
  canWhatsApp: boolean;
  canEnrich: boolean;
  onEmail: () => void;
  onSms: () => void;
  onWhatsApp: () => void;
  onPatch: (patch: { status?: LeadStatus; assignedTo?: string | null }) => void;
};

function LeadDetailBody({
  lead,
  users,
  locale,
  canWrite,
  canEmail,
  canWhatsApp,
  canEnrich,
  onEmail,
  onSms,
  onWhatsApp,
  onPatch,
}: LeadDetailBodyProps) {
  const { t, isRTL } = useLanguage();
  const { isAdmin, hasPermission } = usePermissions();
  const canReadCalling = isAdmin || hasPermission('ai-calling:read');
  const [activeTab, setActiveTab] = useState('overview');
  const isConverted = lead.status === 'converted';
  const contactLog = useLeadContactLog(lead.id);
  const enrich = useEnrichLead();

  const phone = lead.phone;
  const mobile = lead.mobile;
  const callHref = toTelHref(phone ?? mobile);
  const mailHref = toMailtoHref(lead.email);
  const webHref = toSafeWebUrl(lead.website);
  // Prefer the stored provider map link; fall back to a coordinate pin.
  const mapsHref = mapsUrlForLead(lead);
  // WhatsApp prefers the server-normalised number, then the raw phone/mobile.
  const waHref = toWhatsAppHref(lead.normalizedPhone ?? phone ?? mobile);
  const addressLines = getAddressLines(lead.address);
  const addr = lead.address;
  const businessTypeLabel = getLeadBusinessTypeLabel(lead);
  const assignee = findUser(users, lead.assignedTo);
  const creatorName = getLeadCreatorName(lead.createdBy, users);
  const meta = lead.sourceMetadata;
  const discoveryLocationLabel = meta.discoveryLocation?.formattedAddress
    ?? meta.discoveryLocation?.city
    ?? meta.discoveryLocation?.name
    ?? null;
  const discoveryAreaLabel = meta.discoveryArea
    ? meta.discoveryArea.radiusMeters
      ? `${(meta.discoveryArea.radiusMeters / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} km radius`
      : [
          meta.discoveryArea.type,
          meta.discoveryArea.areaSqKm ? `${meta.discoveryArea.areaSqKm.toLocaleString(locale, { maximumFractionDigits: 2 })} km²` : null,
        ].filter(Boolean).join(' · ')
    : null;
  const rating = lead.providerMeta.rating;
  const reviewCount = lead.providerMeta.reviewCount;
  const ratingDistribution = lead.providerMeta.ratingDistribution;
  const businessStatus = lead.providerMeta.businessStatus;
  const openingHoursLines = getOpeningHoursLines(lead.providerMeta.openingHours);
  const photos = lead.providerMeta.photos ?? [];
  const priceLevelLabel = getPriceLevelLabel(t, lead.providerMeta.priceLevel);
  const SourceIcon = LEAD_SOURCE_ICON[lead.source];
  const TypeIcon = lead.type === 'business' ? Building2 : User;

  // ── Enrichment + social (website-scraped) ──────────────────────────────────
  const hasWebsite = Boolean(lead.website && lead.website.trim());
  const enrichment = lead.enrichment ?? {
    status: 'none' as LeadEnrichmentStatus,
    enrichedAt: null,
    source: null,
    foundEmails: [],
    foundPhones: [],
    error: null,
  };
  const enrichMeta = ENRICHMENT_STATUS_META[enrichment.status] ?? ENRICHMENT_STATUS_META.none;
  const EnrichStatusIcon = enrichMeta.icon;
  const enrichSpinning = enrichment.status === 'running' || enrichment.status === 'pending';
  const socialLinks = SOCIAL_PLATFORMS.map((platform) => ({
    ...platform,
    url: lead.social?.[platform.key] ?? null,
  })).filter((platform): platform is typeof platform & { url: string } =>
    Boolean(platform.url && platform.url.trim()),
  );
  // Only ever claim what the server actually found/applied for *this* lead.
  const enrichNote =
    enrich.data && enrich.data.lead.id === lead.id
      ? t(
          'leads.enrich.foundSummary',
          'Found {emails} email(s), {socials} social link(s); filled {applied} field(s)',
          {
            emails: enrich.data.summary.emails,
            socials: enrich.data.summary.socials,
            applied: enrich.data.summary.appliedCount,
          },
        )
      : null;

  type QuickAction = { key: string; label: string; icon: LucideIcon } & (
    | { href: string; external: boolean }
    | { onClick: () => void }
  );
  const quickActions: QuickAction[] = [];
  if (callHref) quickActions.push({ key: 'call', label: t('leads.action.call', 'Call'), icon: Phone, href: callHref, external: false });
  if (canReadCalling) quickActions.push({ key: 'ai-call', label: t('leads.action.aiCall', 'AI call'), icon: Bot, onClick: () => setActiveTab('calls') });
  // Email + WhatsApp open the in-app composer/deep-link dialog rather than a bare
  // link, so they are permission-gated and only shown when the lead can be reached.
  if (canEmail && mailHref) quickActions.push({ key: 'email', label: t('leads.action.email', 'Email'), icon: Mail, onClick: onEmail });
  if (canEmail && callHref) quickActions.push({ key: 'sms', label: 'SMS', icon: Smartphone, onClick: onSms });
  if (canWhatsApp && waHref) quickActions.push({ key: 'whatsapp', label: t('leads.action.whatsapp', 'WhatsApp'), icon: MessageCircle, onClick: onWhatsApp });
  if (webHref) quickActions.push({ key: 'website', label: t('leads.action.website', 'Website'), icon: Globe, href: webHref, external: true });
  if (mapsHref) quickActions.push({ key: 'maps', label: t('leads.action.openMaps', 'Open in Google Maps'), icon: Navigation, href: mapsHref, external: true });

  return (
    <div className="min-w-0 space-y-5">
      {/* Status + type */}
      <div className="flex flex-wrap items-center gap-2">
        <LeadStatusBadge status={lead.status} size="md" />
        <LeadSlaBadge sla={lead.sla} size="md" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          <TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {getLeadTypeLabel(t, lead.type)}
        </span>
      </div>

      {isConverted && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
          <ArrowRightLeft className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-emerald-900 dark:text-emerald-200">
              {t('leads.drawer.convertedBanner', 'Converted to a customer')}
              {lead.convertedAt ? ` · ${formatLeadDateTime(lead.convertedAt, locale)}` : ''}
            </p>
          </div>
          {lead.convertedCustomerId && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={customerHref(lead.convertedCustomerId)}>
                {t('leads.action.openCustomer', 'Open customer')}
                <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Quick actions: only what the lead really has */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label={t('leads.drawer.quickActions', 'Quick actions')} role="group">
          {quickActions.map((action) =>
            'href' in action ? (
              <Button key={action.key} asChild variant="outline" size="sm" className="gap-1.5">
                <a
                  href={action.href}
                  {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {action.label}
                </a>
              </Button>
            ) : (
              <Button key={action.key} variant="outline" size="sm" className={cn('gap-1.5', action.key === 'ai-call' && 'border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary')} onClick={action.onClick}>
                <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {action.label}
              </Button>
            ),
          )}
        </div>
      )}

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} dir={isRTL ? 'rtl' : 'ltr'} className="min-w-0 space-y-5">
        <LeadDetailTabs value={activeTab} items={[
            ['overview', t('leads.drawer.tabOverview', 'Overview')],
            ['responses', t('leads.drawer.tabResponses', 'Responses')],
            ['calls', t('leads.drawer.tabCalls', 'AI Calls')],
            ['communication', t('leads.drawer.tabCommunication', 'Activity')],
            ['history', t('leads.history.tab', 'History')],
            ['business', t('leads.drawer.tabBusiness', 'Business')],
            ['notes', t('leads.drawer.tabNotes', 'Notes')],
            ['consent', t('leads.drawer.tabConsent', 'Consent')],
            ['details', t('leads.drawer.tabDetails', 'Details')],
          ]} />
        <Tabs.Content value="history" className="space-y-5 outline-none">
          <Section title={t('leads.history.title', 'Conversation history')}>
            <LeadConversationHistory leadId={lead.id} />
          </Section>
        </Tabs.Content>
        <Tabs.Content value="overview" className="space-y-5 outline-none">
      <LeadCallLifecycle value={lead.latestCall} />
      {/* Enrich from website: fills missing contact/social data from the lead's
          site. Needs lead:enrich AND a website (disabled + hinted otherwise). */}
      {canEnrich && (
        <div className="space-y-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!hasWebsite || enrich.isPending}
            title={!hasWebsite ? t('leads.enrich.noWebsite', 'Add a website to enable enrichment') : undefined}
            onClick={() => enrich.mutate(lead.id)}
          >
            {enrich.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {enrich.isPending
              ? t('leads.enrich.running', 'Enriching…')
              : t('leads.enrich.action', 'Enrich from website')}
          </Button>
          {!hasWebsite && (
            <p className="text-[11px] text-muted-foreground">
              {t('leads.enrich.noWebsite', 'Add a website to enable enrichment')}
            </p>
          )}
          {enrichNote && (
            <p aria-live="polite" className="text-[12px] text-muted-foreground">
              {enrichNote}
            </p>
          )}
        </div>
      )}

      {/* Pipeline: status + owner, changed in place */}
      <Section title={t('leads.drawer.sectionPipeline', 'Pipeline')}>
        {lead.pipelineStage === 'FOLLOW_UP' && <Link href="/leads/follow-ups" className="text-xs font-medium text-primary hover:underline">{t('leads.lifecycle.FOLLOW_UP', 'In follow-ups')}</Link>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground" id={`status-label-${lead.id}`}>
              {t('leads.drawer.status', 'Status')}
            </p>
            {canWrite && !isConverted ? (
              <Select value={lead.status} onValueChange={(value) => onPatch({ status: value as LeadStatus })}>
                <SelectTrigger aria-labelledby={`status-label-${lead.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {LEAD_EDITABLE_STATUSES.map((status) => {
                    const Icon = LEAD_STATUS_META[status].icon;
                    return (
                      <SelectItem key={status} value={status} textValue={getLeadStatusLabel(t, status)}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', LEAD_STATUS_META[status].iconClassName)} aria-hidden="true" />
                          {getLeadStatusLabel(t, status)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-10 items-center">
                <LeadStatusBadge status={lead.status} size="md" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground" id={`assignee-label-${lead.id}`}>
              {t('leads.drawer.assignee', 'Assigned to')}
            </p>
            {canWrite ? (
              <Select
                value={lead.assignedTo ?? UNASSIGNED}
                onValueChange={(value) => onPatch({ assignedTo: value === UNASSIGNED ? null : value })}
              >
                <SelectTrigger aria-labelledby={`assignee-label-${lead.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4} className="max-h-72">
                  <SelectItem value={UNASSIGNED}>{t('leads.assignee.unassigned', 'Unassigned')}</SelectItem>
                  {/* An owner missing from the directory must stay selectable, or the control would show a blank. */}
                  {lead.assignedTo && !assignee && (
                    <SelectItem value={lead.assignedTo}>{t('leads.assignee.unknown', 'Unknown user')}</SelectItem>
                  )}
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id} textValue={getUserDisplayName(user)}>
                      <span className="flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        {getUserDisplayName(user)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-10 items-center text-sm">
                {lead.assignedTo
                  ? getUserDisplayName(assignee) || t('leads.assignee.unknown', 'Unknown user')
                  : t('leads.assignee.unassigned', 'Unassigned')}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Lead quality: evidence-backed score breakdown */}
      <Section title={t('leads.score.section', 'Why this score')}>
        <LeadScorePanel leadId={lead.id} canRecalculate={canWrite} />
      </Section>

      {/* Contact */}
      <Section title={t('leads.drawer.sectionContact', 'Contact')}>
        <LeadPiiReveal lead={lead} />
        {phone || mobile || lead.email || lead.website ? (
          <InfoList label={t('leads.drawer.sectionContact', 'Contact')}>
            {phone && (
              <InfoRow icon={Phone} label={t('leads.drawer.phone', 'Phone')}>
                {toTelHref(phone) ? (
                  <a href={toTelHref(phone) ?? undefined} className={linkClass}>
                    <LtrText>{phone}</LtrText>
                  </a>
                ) : (
                  <LtrText>{phone}</LtrText>
                )}
              </InfoRow>
            )}
            {mobile && (
              <InfoRow icon={Smartphone} label={t('leads.drawer.mobile', 'Mobile')}>
                {toTelHref(mobile) ? (
                  <a href={toTelHref(mobile) ?? undefined} className={linkClass}>
                    <LtrText>{mobile}</LtrText>
                  </a>
                ) : (
                  <LtrText>{mobile}</LtrText>
                )}
              </InfoRow>
            )}
            {lead.email && (
              <InfoRow icon={Mail} label={t('leads.drawer.email', 'Email')}>
                {mailHref ? (
                  <a href={mailHref} className={linkClass}>
                    <LtrText>{lead.email}</LtrText>
                  </a>
                ) : (
                  <LtrText>{lead.email}</LtrText>
                )}
              </InfoRow>
            )}
            {lead.website && (
              <InfoRow icon={Globe} label={t('leads.drawer.website', 'Website')}>
                {webHref ? (
                  <ExternalAnchor href={webHref}>
                    <LtrText>{getWebsiteLabel(lead)}</LtrText>
                  </ExternalAnchor>
                ) : (
                  <LtrText>{lead.website}</LtrText>
                )}
              </InfoRow>
            )}
          </InfoList>
        ) : (
          <MutedText>{t('leads.drawer.noContact', 'No contact details yet.')}</MutedText>
        )}
      </Section>

        </Tabs.Content>
        <Tabs.Content value="consent" className="space-y-5 outline-none">
      <Section title="Consent & suppression">
        <LeadConsentPanel leadId={lead.id} canWrite={canEmail} />
      </Section>
      <Section title="AI calling consent">
        <LeadCallsTab leadId={lead.id} view="consent" />
      </Section>
        </Tabs.Content>
        <Tabs.Content value="business" className="space-y-5 outline-none">

      {/* Social profiles (website-scraped) — only platforms that actually have a link */}
      {socialLinks.length > 0 && (
        <Section title={t('leads.social.section', 'Social profiles')}>
          <InfoList label={t('leads.social.section', 'Social profiles')}>
            {socialLinks.map(({ key, icon: Icon, labelKey, fallback, url }) => {
              const safe = toSafeWebUrl(url);
              return (
                <div key={key} className="flex items-start gap-3 px-3 py-2.5">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  <dt className="w-28 shrink-0 text-xs text-muted-foreground">{t(labelKey, fallback)}</dt>
                  <dd className="min-w-0 flex-1 break-words text-sm text-foreground">
                    {safe ? (
                      <ExternalAnchor href={safe}>
                        <LtrText>{url}</LtrText>
                      </ExternalAnchor>
                    ) : (
                      <LtrText>{url}</LtrText>
                    )}
                  </dd>
                </div>
              );
            })}
          </InfoList>
        </Section>
      )}

      {/* Address */}
      <Section title={t('leads.drawer.sectionAddress', 'Address')}>
        {addressLines.length > 0 || lead.location || addr.formatted ? (
          <InfoList label={t('leads.drawer.sectionAddress', 'Address')}>
            {(addr.formatted || addressLines.length > 0) && (
              <InfoRow icon={MapPin} label={t('leads.drawer.fullAddress', 'Full address')}>
                {addr.formatted
                  ? <span className="block">{addr.formatted}</span>
                  : addressLines.map((line) => (
                      <span key={line} className="block">{line}</span>
                    ))}
              </InfoRow>
            )}
            {addr.area && (
              <InfoRow icon={MapPin} label={t('leads.drawer.area', 'Area')}>{addr.area}</InfoRow>
            )}
            {addr.city && !/^[\d\s-]{3,}$/.test(addr.city.trim()) && (
              <InfoRow icon={Building2} label={t('leads.drawer.city', 'City')}>{addr.city}</InfoRow>
            )}
            {(addr.canton ?? addr.region) && (
              <InfoRow icon={Compass} label={t('leads.drawer.region', 'Region')}>{addr.canton ?? addr.region}</InfoRow>
            )}
            {addr.postalCode && (
              <InfoRow icon={Hash} label={t('leads.drawer.postalCode', 'Postal code')}>{addr.postalCode}</InfoRow>
            )}
            {addr.country && (
              <InfoRow icon={Globe} label={t('leads.drawer.country', 'Country')}>{addr.country}</InfoRow>
            )}
            {lead.location && (
              <InfoRow icon={Compass} label={t('leads.drawer.coordinates', 'Coordinates')}>
                <LtrText className="font-mono text-xs">
                  {lead.location.lat.toFixed(5)}, {lead.location.lng.toFixed(5)}
                </LtrText>
                {mapsHref && (
                  <>
                    {' '}
                    <ExternalAnchor href={mapsHref} className="ms-1 text-xs">
                      {t('leads.action.openMaps', 'Open in Google Maps')}
                    </ExternalAnchor>
                  </>
                )}
              </InfoRow>
            )}
          </InfoList>
        ) : (
          <MutedText>{t('leads.drawer.noAddress', 'No address on file.')}</MutedText>
        )}
      </Section>

      {/* Opening hours */}
      {openingHoursLines.length > 0 && (
        <Section title={t('leads.drawer.sectionHours', 'Opening hours')}>
          <ul className="space-y-1.5 rounded-xl border border-border/60 bg-background/40 p-4 text-sm">
            {openingHoursLines.map((line, index) => (
              <li key={`${index}-${line}`} className="flex items-start gap-2 text-foreground">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-words">{line}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Photos (only ever what the provider actually supplied) */}
      {photos.length > 0 && (
        <Section title={t('leads.drawer.sectionPhotos', 'Photos')}>
          <div className="grid grid-cols-3 gap-2">
            {photos.slice(0, 9).map((photo) => {
              const safe = toSafeWebUrl(photo.url);
              if (!safe) return null;
              return (
                <a
                  key={photo.url}
                  href={safe}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-lg border border-border/60 bg-muted"
                >
                  {/* Provider-hosted thumbnail; no-referrer keeps it from leaking the CRM URL. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safe}
                    alt={photo.attribution ?? ''}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-square h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </a>
              );
            })}
          </div>
        </Section>
      )}

        </Tabs.Content>
        <Tabs.Content value="details" className="space-y-5 outline-none">
      {/* Source & provenance */}
      <Section title={t('leads.drawer.sectionSource', 'Source')}>
        <InfoList label={t('leads.drawer.sectionSource', 'Source')}>
          <InfoRow icon={SourceIcon} label={t('leads.drawer.source', 'Source')}>
            {getLeadSourceLabel(t, lead.source)}
          </InfoRow>
          {/* Enrichment status: icon + label (never colour alone), with a relative
              timestamp once it has run successfully. */}
          <InfoRow icon={Sparkles} label={t('leads.enrich.status', 'Enrichment')}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <EnrichStatusIcon
                className={cn('h-3.5 w-3.5 shrink-0', enrichMeta.className, enrichSpinning && 'animate-spin')}
                aria-hidden="true"
              />
              <span>{t(enrichMeta.labelKey, enrichMeta.fallback)}</span>
              {enrichment.status === 'done' && enrichment.enrichedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(enrichment.enrichedAt, locale)}
                </span>
              )}
            </span>
          </InfoRow>
          {meta.discoveredAt && (
            <InfoRow icon={CalendarClock} label={t('leads.drawer.discoveredAt', 'Discovered')}>
              {formatLeadDateTime(meta.discoveredAt, locale)}
            </InfoRow>
          )}
          {businessTypeLabel && (
            <InfoRow icon={Building2} label={t('leads.drawer.businessType', 'Business type')}>
              {businessTypeLabel}
            </InfoRow>
          )}
          {businessStatus && (
            <InfoRow icon={Store} label={t('leads.drawer.businessStatus', 'Business status')}>
              {businessStatus}
            </InfoRow>
          )}
          {meta.keyword && (
            <InfoRow icon={Search} label={t('leads.drawer.keyword', 'Keyword')}>
              {meta.keyword}
            </InfoRow>
          )}
          {discoveryLocationLabel && (
            <InfoRow icon={MapPin} label={t('leads.drawer.discoveryLocation', 'Selected location')}>
              {discoveryLocationLabel}
            </InfoRow>
          )}
          {discoveryAreaLabel && (
            <InfoRow icon={Compass} label={t('leads.drawer.discoveryArea', 'Selected search area')}>
              {discoveryAreaLabel}
            </InfoRow>
          )}
          {meta.discoverySearchCoordinates?.center && (
            <InfoRow icon={Compass} label={t('leads.drawer.discoverySearchCoordinates', 'Discovery search coordinates')}>
              <LtrText className="font-mono text-xs">
                {meta.discoverySearchCoordinates.center.lat.toFixed(5)}, {meta.discoverySearchCoordinates.center.lng.toFixed(5)}
                {meta.discoverySearchCoordinates.radiusMeters
                  ? ` · ${Math.round(meta.discoverySearchCoordinates.radiusMeters)} m`
                  : ''}
              </LtrText>
            </InfoRow>
          )}
          {rating !== null && (
            <InfoRow icon={Star} label={t('leads.drawer.rating', 'Google rating')}>
              <span className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-2">
                  <span className="font-semibold">{rating.toFixed(1)}</span>
                  <RatingStars rating={rating} />
                  {reviewCount !== null && (
                    <span className="text-xs text-muted-foreground">
                      {reviewCount === 1
                        ? t('leads.drawer.reviewOne', '1 review')
                        : t('leads.drawer.reviewMany', '{count} reviews', { count: reviewCount })}
                    </span>
                  )}
                </span>
                {/* Show the real per-star histogram when the provider supplied it;
                    otherwise be honest that the breakdown is unavailable — never
                    fabricate counts from the overall rating. */}
                {ratingDistribution ? (
                  <span className="mt-1 block max-w-60">
                    <RatingDistribution distribution={ratingDistribution} locale={locale} />
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t('leads.drawer.ratingNoBreakdown', 'Detailed rating breakdown is not available from the source.')}
                  </span>
                )}
              </span>
            </InfoRow>
          )}
          {priceLevelLabel && (
            <InfoRow icon={Wallet} label={t('leadgen.detail.priceLevel', 'Price level')}>
              {priceLevelLabel}
            </InfoRow>
          )}
          {meta.googlePlaceId && (
            <InfoRow icon={Hash} label={t('leads.drawer.placeId', 'Google Place ID')}>
              <code dir="ltr" className="block break-all text-start font-mono text-xs text-muted-foreground">{meta.googlePlaceId}</code>
            </InfoRow>
          )}
          {meta.discoverySessionId && (
            <InfoRow icon={Hash} label={t('leads.drawer.discoverySession', 'Discovery session')}>
              <code dir="ltr" className="block break-all text-start font-mono text-xs text-muted-foreground">{meta.discoverySessionId}</code>
            </InfoRow>
          )}
        </InfoList>
      </Section>

      {/* Record details */}
      <Section title={t('leads.drawer.sectionDetails', 'Details')}>
        <InfoList label={t('leads.drawer.sectionDetails', 'Details')}>
          <InfoRow icon={CalendarClock} label={t('leads.drawer.created', 'Created')}>
            {formatLeadDateTime(lead.createdAt, locale)}
          </InfoRow>
          <InfoRow icon={User} label={t('leads.drawer.createdBy', 'Created by')}>
            {creatorName || <span className="text-muted-foreground/70">—</span>}
          </InfoRow>
          <InfoRow icon={CalendarClock} label={t('leads.drawer.updated', 'Last updated')}>
            {formatLeadDateTime(lead.updatedAt, locale)}
          </InfoRow>
          <InfoRow icon={Hash} label={t('leads.drawer.leadId', 'Lead ID')}>
            <code dir="ltr" className="block break-all text-start font-mono text-xs text-muted-foreground">{lead.id}</code>
          </InfoRow>
        </InfoList>
      </Section>
        </Tabs.Content>
        <Tabs.Content value="notes" className="space-y-5 outline-none">
      {/* Notes & tags */}
      <Section title={t('leads.drawer.sectionNotes', 'Notes')}>
        {lead.notes || lead.tags.length > 0 ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
            {lead.notes && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{lead.notes}</p>}
            {lead.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('leads.drawer.tags', 'Tags')}>
                {lead.tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {tag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <MutedText>{t('leads.drawer.noNotes', 'No notes yet.')}</MutedText>
        )}
      </Section>

        </Tabs.Content>
        <Tabs.Content value="communication" className="space-y-5 outline-none">
      {/* Communication: sent e-mails (shared panel) + logged WhatsApp/phone/manual */}
      <Section title={t('leads.drawer.sectionHistory', 'Communication')}>
        <div className="space-y-4">
          <EmailHistoryPanel sourceModule="lead" sourceRecordId={lead.id} />
          <ProviderMessageHistory leadId={lead.id} locale={locale} />
          <ContactLog
            entries={contactLog.data ?? []}
            loading={contactLog.isLoading}
            locale={locale}
            t={t}
          />
          <LeadAccessHistory leadId={lead.id} />
        </div>
      </Section>

      {/* Mobile app SIM calls / SMS (device-originated) + merged lead qualification */}
      <Section title={t('leads.drawer.sectionMobileComm', 'Mobile calls & SMS')}>
        <LeadMobileCommunications leadId={lead.id} />
      </Section>
      <Section title={t('smsOps.lead.section', 'Contact limits')}><LeadContactPolicy leadId={lead.id} /></Section>

        </Tabs.Content>
        <Tabs.Content value="responses" className="space-y-5 outline-none">
          <ProviderMessageHistory key={`responses:${lead.id}`} leadId={lead.id} locale={locale} receivedOnly />
          <Section title={t('leads.drawer.callResponses', 'Responses from AI calls')}>
            <LeadCallsTab leadId={lead.id} view="responses" />
          </Section>
        </Tabs.Content>
        <Tabs.Content value="calls" className="space-y-5 outline-none">
        <LeadAiCalling key={lead.id} leadId={lead.id} />
      {/* AI voice calls: campaigns, dispositions, collected answers, status history */}
      <Section title={t('leads.drawer.sectionAiCalls', 'AI Calls')}>
        <LeadCallsTab leadId={lead.id} />
      </Section>
        </Tabs.Content>
      </Tabs.Root>


    </div>
  );
}
