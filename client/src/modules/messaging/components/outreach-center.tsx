'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, Archive, ArrowUpRight, BarChart3, CheckCircle2, Clock3,
  Copy, Download, Eye, Filter, Layers3, Mail, MessageCircle, MessageSquareText,
  MoreHorizontal, Pause, Play, Plus, RefreshCw, RotateCcw, Search, Send,
  Settings, ShieldCheck, Sparkles, Users, XCircle,
} from 'lucide-react';
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent,
  DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input,
  Label, Progress, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs,
  TabsContent, TabsList, TabsTrigger, Textarea,
} from './messaging-ui-kit';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import {
  messagingApi, type Campaign, type CampaignRecipient, type MessageTemplate,
  type OutreachChannel, type OutreachPurpose,
} from '@/modules/leads/services/messaging-api';
import {
  analyticsPresetRange, buildAnalyticsParams, formatCostBuckets, isAnalyticsRangeValid,
  type AnalyticsPreset,
} from '@/modules/messaging/analytics-reporting';

const channelIcon = { email: Mail, sms: MessageSquareText, whatsapp: MessageCircle } as const;
const channelLabel = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' } as const;
const activeStatuses = new Set(['scheduled', 'queued', 'running']);
const finalStatuses = new Set(['completed', 'cancelled']);

// `/leads` is a full-height workspace whose route layout intentionally hides
// overflow. Child pages that are taller than the viewport must therefore own
// their scroll region instead of relying on the platform `<main>` element.
export const outreachScrollContainerClassName = 'h-full min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth scrollbar-thin';

const statusTone: Record<string, string> = {
  completed: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  delivered: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  read: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  running: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  queued: 'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  scheduled: 'border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400',
  paused: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  unknown: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  failed: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  undelivered: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400',
  cancelled: 'border-slate-500/25 bg-slate-500/10 text-slate-500',
  draft: 'border-border bg-muted/50 text-muted-foreground',
};

export function campaignDeliveryRate(campaign: Campaign) {
  const submitted = campaign.summary.accepted + campaign.summary.sent + campaign.summary.delivered
    + campaign.summary.read + campaign.summary.failed + campaign.summary.unknown;
  return submitted ? (campaign.summary.delivered + campaign.summary.read) / submitted : 0;
}

export function campaignProcessingProgress(campaign: Campaign) {
  if (campaign.monitoring?.progress) return campaign.monitoring.progress;
  const eligible = campaign.summary.eligible || 0;
  const queued = campaign.summary.queued || 0;
  const inFlight = campaign.summary.submitting || 0;
  const pending = (campaign.summary.draft || 0) + queued + inFlight;
  const processed = Math.max(0, eligible - pending);
  return {
    eligible, processed, pending, queued, inFlight,
    percent: eligible ? Math.min(100, Math.round((processed / eligible) * 1000) / 10) : 0,
  };
}

export function filterCampaigns(campaigns: Campaign[], search: string, channel: string, status: string) {
  const term = search.trim().toLocaleLowerCase();
  return campaigns.filter((campaign) => {
    if (channel !== 'all' && campaign.channel !== channel) return false;
    if (status !== 'all' && campaign.status !== status) return false;
    if (!term) return true;
    return `${campaign.name} ${campaign.description || ''}`.toLocaleLowerCase().includes(term);
  });
}

export function buildCampaignListParams(page: number, search: string, channel: string, status: string) {
  const q = search.trim();
  return {
    page, limit: 25,
    ...(q ? { q } : {}),
    ...(channel !== 'all' ? { channel } : {}),
    ...(status !== 'all' ? { status } : {}),
  };
}

export function canManageTemplate(template: Pick<MessageTemplate, 'createdBy'>, currentUserId: string | null) {
  const ownerId = typeof template.createdBy === 'string' ? template.createdBy : template.createdBy?._id;
  return Boolean(currentUserId && ownerId && ownerId === currentUserId);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds < 1) return 'Calculating…';
  if (seconds < 60) return '< 1 minute';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn('gap-1.5 capitalize', statusTone[status])}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</Badge>;
}

function CampaignsPanel() {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canAdmin = hasPermission('settings:admin');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaignPage, setCampaignPage] = useState(1);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientStatus, setRecipientStatus] = useState('all');
  const [bulkRetryOpen, setBulkRetryOpen] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const campaignParams = useMemo(
    () => buildCampaignListParams(campaignPage, debouncedSearch, channelFilter, statusFilter),
    [campaignPage, channelFilter, debouncedSearch, statusFilter],
  );
  const campaigns = useQuery({
    queryKey: ['messaging', 'campaigns', campaignParams], queryFn: () => messagingApi.listCampaigns(campaignParams),
    refetchInterval: 5000,
    placeholderData: (previous) => previous,
  });
  const analytics = useQuery({
    queryKey: ['messaging', 'analytics', 'campaign-overview'],
    queryFn: () => messagingApi.analytics(),
    refetchInterval: 15_000,
  });
  const health = useQuery({
    queryKey: ['messaging', 'provider-health', 'campaign-overview'],
    queryFn: messagingApi.providerHealth,
    enabled: canAdmin,
    staleTime: 10_000,
  });
  const allCampaigns = useMemo(() => campaigns.data?.data ?? [], [campaigns.data?.data]);
  const visibleCampaigns = allCampaigns;
  const currentSelected = allCampaigns.find((campaign) => campaign._id === selected?._id) ?? selected;
  const recipients = useQuery({
    queryKey: ['messaging', 'recipients', currentSelected?._id, recipientPage, recipientStatus],
    queryFn: () => messagingApi.listRecipients(currentSelected!._id, {
      page: recipientPage, limit: 25, ...(recipientStatus !== 'all' ? { status: recipientStatus } : {}),
    }),
    enabled: Boolean(currentSelected), refetchInterval: 5000,
    placeholderData: (previous) => previous,
  });
  const retryStatus = recipientStatus === 'failed' || recipientStatus === 'undelivered'
    ? recipientStatus as 'failed' | 'undelivered'
    : undefined;
  const retryEligibility = useQuery({
    queryKey: ['messaging', 'retry-eligibility', currentSelected?._id, retryStatus || 'all'],
    queryFn: () => messagingApi.retryEligibility(currentSelected!._id, retryStatus),
    enabled: Boolean(currentSelected && canWrite && currentSelected.summary.failed > 0),
    refetchInterval: bulkRetryOpen ? 5000 : false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['messaging', 'campaigns'] });
    void queryClient.invalidateQueries({ queryKey: ['messaging', 'recipients'] });
    void queryClient.invalidateQueries({ queryKey: ['messaging', 'analytics'] });
  };
  const action = useMutation({
    mutationFn: async ({ kind, campaign }: { kind: 'pause' | 'resume' | 'cancel'; campaign: Campaign }) => {
      if (kind === 'pause') return messagingApi.pauseCampaign(campaign._id);
      if (kind === 'resume') return messagingApi.resumeCampaign(campaign._id);
      return messagingApi.cancelCampaign(campaign._id);
    },
    onSuccess: (value) => { setSelected(value); refresh(); showSuccess(`Campaign ${value.status}`); },
    onError: showError,
  });
  const retry = useMutation({
    mutationFn: ({ campaignId, recipientId }: { campaignId: string; recipientId: string }) => messagingApi.retryRecipients(campaignId, [recipientId]),
    onSuccess: () => { refresh(); showSuccess('Recipient queued for a safe retry'); }, onError: showError,
  });
  const bulkRetry = useMutation({
    mutationFn: () => messagingApi.retryEligibleRecipients(currentSelected!._id, {
      expectedCount: retryEligibility.data!.retryable,
      confirmation: true,
      ...(retryStatus ? { status: retryStatus } : {}),
    }),
    onSuccess: (result) => {
      setSelected(result.campaign);
      setBulkRetryOpen(false);
      refresh();
      showSuccess(`${result.queued} recipients queued for safe retry`);
    },
    onError: (error) => { setBulkRetryOpen(false); showError(error); refresh(); },
  });
  const exportMutation = useMutation({
    mutationFn: (campaign: Campaign) => messagingApi.exportCampaign(campaign._id),
    onSuccess: (blob, campaign) => downloadBlob(blob, `campaign-${campaign._id}.csv`), onError: showError,
  });

  const activeCount = analytics.data?.activeCampaigns ?? 0;
  const readiness = health.data?.operations?.readiness;
  const currentProgress = currentSelected ? campaignProcessingProgress(currentSelected) : null;
  const overview = [
    { label: 'Total campaigns', value: analytics.data?.campaigns ?? allCampaigns.length, detail: `${activeCount} currently active`, icon: Layers3, tone: 'text-blue-600 bg-blue-500/10' },
    { label: 'Audience reached', value: analytics.data?.totalRecipients ?? 0, detail: `${analytics.data?.submitted ?? 0} provider submissions`, icon: Users, tone: 'text-violet-600 bg-violet-500/10' },
    { label: 'Delivered', value: analytics.data?.delivered ?? 0, detail: `${Math.round((analytics.data?.deliveryRate ?? 0) * 100)}% verified delivery`, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Needs attention', value: (analytics.data?.byStatus ?? []).filter((row) => ['failed', 'unknown', 'undelivered'].includes(row._id)).reduce((sum, row) => sum + row.count, 0), detail: `${analytics.data?.fallbackCount ?? 0} SMS fallbacks`, icon: AlertCircle, tone: 'text-amber-600 bg-amber-500/10' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.map((item) => {
          const Icon = item.icon;
          return <Card key={item.label} className="group overflow-hidden border-border/70 bg-card/80 shadow-sm backdrop-blur-sm"><CardContent className="relative p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{compactNumber(item.value)}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div><div className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105', item.tone)}><Icon className="h-5 w-5" /></div></div></CardContent></Card>;
        })}
      </div>

      {canAdmin && readiness && !readiness.ready && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-sm font-semibold">Provider setup needs attention</p><p className="text-xs text-muted-foreground">{readiness.counts.fail} blocking checks and {readiness.counts.warn} warnings must be reviewed before live outreach.</p></div></div>
          <Button asChild size="sm" variant="outline"><Link href="/admin/messaging">Review setup <ArrowUpRight className="h-3.5 w-3.5" /></Link></Button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
        <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><CardTitle>Campaign workspace</CardTitle><p className="mt-1 text-sm text-muted-foreground">Monitor drafts, schedules, delivery evidence, and provider outcomes.</p></div>
              <Button size="sm" variant="outline" onClick={refresh} disabled={campaigns.isFetching}><RefreshCw className={cn('h-4 w-4', campaigns.isFetching && 'animate-spin')} /> Refresh</Button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px]">
              <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search campaigns" value={search} onChange={(event) => { setSearch(event.target.value); setCampaignPage(1); }} className="ps-9" placeholder="Search campaign or description…" /></div>
              <Select value={channelFilter} onValueChange={(value) => { setChannelFilter(value); setCampaignPage(1); }}><SelectTrigger aria-label="Filter by channel"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select>
              <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setCampaignPage(1); }}><SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{['draft', 'scheduled', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled'].map((status) => <SelectItem key={status} value={status}><span className="capitalize">{status}</span></SelectItem>)}</SelectContent></Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {campaigns.isLoading ? <CampaignTableSkeleton /> : campaigns.isError ? (
              <EmptyState icon={AlertCircle} title="Campaigns could not be loaded" description="The server did not return the campaign workspace. Retry without losing your current filters." action={<Button variant="outline" onClick={() => void campaigns.refetch()}><RefreshCw className="h-4 w-4" /> Try again</Button>} />
            ) : allCampaigns.length === 0 && !debouncedSearch && channelFilter === 'all' && statusFilter === 'all' ? (
              <EmptyState className="min-h-80" icon={Send} title="Create your first outreach campaign" description="Start from Leads, choose only the recipients you intend to contact, and review channel eligibility before anything is queued." action={canWrite ? <Button asChild><Link href="/leads"><Users className="h-4 w-4" /> Select leads</Link></Button> : undefined} />
            ) : visibleCampaigns.length === 0 ? (
              <EmptyState className="min-h-72" icon={Filter} title="No campaigns match these filters" description="Adjust the search, channel, or status filters to broaden the result." action={<Button variant="outline" onClick={() => { setSearch(''); setChannelFilter('all'); setStatusFilter('all'); setCampaignPage(1); }}>Clear filters</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-end">Audience</TableHead><TableHead className="min-w-36">Delivery</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                  <TableBody>
                    {visibleCampaigns.map((campaign) => {
                      const Icon = channelIcon[campaign.channel];
                      const rate = campaignDeliveryRate(campaign);
                      return (
                        <TableRow key={campaign._id} className="group cursor-pointer" data-state={currentSelected?._id === campaign._id ? 'selected' : undefined} onClick={() => { setSelected(campaign); setRecipientPage(1); setRecipientStatus('all'); }}>
                          <TableCell><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground"><Icon className="h-4 w-4" /></div><div><p className="max-w-60 truncate font-medium">{campaign.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{campaign.isTest ? 'Test campaign · ' : ''}{formatDate(campaign.createdAt)}</p></div></div></TableCell>
                          <TableCell><span className="font-medium">{channelLabel[campaign.channel]}</span></TableCell>
                          <TableCell><StatusBadge status={campaign.status} /></TableCell>
                          <TableCell className="text-end font-medium tabular-nums">{campaign.summary.total}</TableCell>
                          <TableCell><div className="flex items-center gap-2"><Progress value={rate * 100} className="h-1.5 min-w-20" /><span className="w-9 text-end text-xs font-medium tabular-nums">{Math.round(rate * 100)}%</span></div></TableCell>
                          <TableCell><MoreHorizontal className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {(campaigns.data?.pagination.pages ?? 0) > 1 && <div className="flex items-center justify-between border-t border-border/70 px-4 py-3"><p className="text-xs text-muted-foreground">Page {campaigns.data?.pagination.page} of {campaigns.data?.pagination.pages} · {compactNumber(campaigns.data?.pagination.total ?? 0)} campaigns</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={campaignPage <= 1 || campaigns.isFetching} onClick={() => setCampaignPage((page) => Math.max(1, page - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={campaignPage >= (campaigns.data?.pagination.pages ?? 1) || campaigns.isFetching} onClick={() => setCampaignPage((page) => page + 1)}>Next</Button></div></div>}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm xl:sticky xl:top-4 xl:self-start">
          <CardHeader className={cn('border-b border-border/70 pb-4', currentSelected && 'bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent')}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Campaign details</p><CardTitle className="mt-2 truncate">{currentSelected?.name || 'No campaign selected'}</CardTitle>{currentSelected && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{currentSelected.scheduledAt ? `Scheduled ${formatDate(currentSelected.scheduledAt)} · ${currentSelected.monitoring?.schedule.timezone || 'UTC'}` : `Created ${formatDate(currentSelected.createdAt)}`}</p>}</div>
              {currentSelected && <div className="flex flex-col items-end gap-1.5"><StatusBadge status={currentSelected.status} />{currentSelected.monitoring?.largeAudience && <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-[10px] text-violet-600">Large audience</Badge>}</div>}
            </div>
            {currentSelected && canWrite && (
              <div className="flex flex-wrap gap-2 pt-3">
                {activeStatuses.has(currentSelected.status) && <Button size="sm" variant="outline" onClick={() => action.mutate({ kind: 'pause', campaign: currentSelected })}><Pause className="h-4 w-4" /> Pause</Button>}
                {currentSelected.status === 'draft' && <Button size="sm" onClick={() => action.mutate({ kind: 'resume', campaign: currentSelected })}><Play className="h-4 w-4" /> Start draft</Button>}
                {currentSelected.status === 'paused' && <Button size="sm" onClick={() => action.mutate({ kind: 'resume', campaign: currentSelected })}><Play className="h-4 w-4" /> Resume</Button>}
                {!finalStatuses.has(currentSelected.status) && <Button size="sm" variant="outline" className="text-destructive" onClick={() => action.mutate({ kind: 'cancel', campaign: currentSelected })}><XCircle className="h-4 w-4" /> Cancel</Button>}
                <Button size="sm" variant="outline" onClick={() => exportMutation.mutate(currentSelected)}><Download className="h-4 w-4" /> CSV</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-4">
            {!currentSelected ? <EmptyState className="min-h-72" icon={Activity} title="Recipient evidence appears here" description="Select a campaign to inspect delivery progress, provider routing, failures, and safe retry decisions." /> : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Eligible', currentSelected.summary.eligible, 'text-blue-600'],
                    ['Accepted', currentSelected.summary.accepted + currentSelected.summary.sent, 'text-violet-600'],
                    ['Delivered', currentSelected.summary.delivered + currentSelected.summary.read, 'text-emerald-600'],
                    ['Failed', currentSelected.summary.failed, currentSelected.summary.failed ? 'text-rose-600' : 'text-muted-foreground'],
                  ].map(([label, value, tone]) => <div key={String(label)} className="rounded-xl border border-border/70 bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn('mt-1 text-xl font-semibold tabular-nums', tone)}>{value}</p></div>)}
                </div>
                {currentProgress && <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">Processing progress</span><span className="font-semibold tabular-nums">{currentProgress.processed} / {currentProgress.eligible} · {currentProgress.percent}%</span></div><Progress className="mt-2 h-2" value={currentProgress.percent} /><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{currentProgress.queued} queued</span><span>{currentProgress.inFlight} submitting</span><span>{currentProgress.pending} remaining</span>{currentSelected.monitoring?.throughput.processedPerMinute != null && <span>{currentSelected.monitoring.throughput.processedPerMinute}/min</span>}{currentSelected.monitoring?.throughput.estimatedSecondsRemaining != null && <span>ETA {formatDuration(currentSelected.monitoring.throughput.estimatedSecondsRemaining)}</span>}</div></div>}
                <div className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between text-xs"><span className="font-medium">Verified delivery</span><span className="font-semibold tabular-nums">{Math.round(campaignDeliveryRate(currentSelected) * 100)}%</span></div><Progress className="mt-2 h-1.5" value={campaignDeliveryRate(currentSelected) * 100} /><p className="mt-2 text-[11px] text-muted-foreground">Calculated only from submitted recipient outcomes.</p></div>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">Recipient evidence</p><div className="flex items-center gap-2">{canWrite && (retryEligibility.data?.retryable || 0) > 0 && <Button size="sm" variant="outline" onClick={() => setBulkRetryOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Retry {retryEligibility.data?.retryable} safe</Button>}<Select value={recipientStatus} onValueChange={(value) => { setRecipientStatus(value); setRecipientPage(1); }}><SelectTrigger className="h-8 w-40" aria-label="Filter recipient outcomes"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All outcomes</SelectItem>{['draft', 'queued', 'submitting', 'accepted', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'unknown', 'suppressed', 'ineligible', 'cancelled'].map((status) => <SelectItem key={status} value={status}><span className="capitalize">{status}</span></SelectItem>)}</SelectContent></Select></div></div>
                <div className="max-h-[410px] overflow-auto rounded-xl border border-border/70">
                  {recipients.isLoading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div> : recipients.data?.data.length ? <Table><TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Status</TableHead><TableHead>Provider</TableHead><TableHead /></TableRow></TableHeader><TableBody>{recipients.data.data.map((recipient) => <RecipientRow key={recipient._id} campaign={currentSelected} recipient={recipient} retry={() => retry.mutate({ campaignId: currentSelected._id, recipientId: recipient._id })} onChanged={refresh} />)}</TableBody></Table> : <EmptyState className="py-10" icon={Users} title={recipientStatus === 'all' ? 'No recipients recorded' : 'No recipients match this outcome'} description={recipientStatus === 'all' ? 'Draft eligibility results will appear here when recipients are added.' : 'Choose another outcome to inspect more recipient evidence.'} />}
                </div>
                {(recipients.data?.pagination.pages ?? 0) > 1 && <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Page {recipients.data?.pagination.page} of {recipients.data?.pagination.pages} · {recipients.data?.pagination.total} recipients</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={recipientPage <= 1 || recipients.isFetching} onClick={() => setRecipientPage((page) => Math.max(1, page - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={recipientPage >= (recipients.data?.pagination.pages ?? 1) || recipients.isFetching} onClick={() => setRecipientPage((page) => page + 1)}>Next</Button></div></div>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog open={bulkRetryOpen} onOpenChange={setBulkRetryOpen}><DialogContent><DialogHeader><DialogTitle>Retry safely eligible recipients?</DialogTitle><DialogDescription>The server recalculates provider evidence immediately before queueing. If the count changes, nothing is confirmed and you must review again.</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-2"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3"><p className="text-xs text-muted-foreground">Safe to retry</p><p className="mt-1 text-xl font-semibold text-emerald-600 tabular-nums">{retryEligibility.data?.retryable || 0}</p></div><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3"><p className="text-xs text-muted-foreground">Ambiguous</p><p className="mt-1 text-xl font-semibold text-amber-600 tabular-nums">{retryEligibility.data?.blocked.ambiguous || 0}</p></div><div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3"><p className="text-xs text-muted-foreground">Permanent</p><p className="mt-1 text-xl font-semibold text-rose-600 tabular-nums">{retryEligibility.data?.blocked.permanent || 0}</p></div></div><p className="text-xs text-muted-foreground">Scope: {retryStatus ? `${retryStatus} outcomes` : 'all failed and undelivered outcomes'}. Ambiguous and permanent outcomes are never included.</p><DialogFooter><Button variant="outline" onClick={() => setBulkRetryOpen(false)}>Cancel</Button><Button disabled={!retryEligibility.data?.retryable || bulkRetry.isPending} onClick={() => bulkRetry.mutate()}><RotateCcw className={cn('h-4 w-4', bulkRetry.isPending && 'animate-spin')} /> Confirm {retryEligibility.data?.retryable || 0} retries</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function CampaignTableSkeleton() {
  return <div className="space-y-1 p-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="grid grid-cols-[2fr_0.8fr_0.8fr_0.5fr_1fr] items-center gap-4 rounded-lg px-2 py-3"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-xl" /><div className="space-y-2"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-2.5 w-24" /></div></div><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="ms-auto h-3 w-8" /><Skeleton className="h-2 w-full" /></div>)}</div>;
}

function RecipientRow({ campaign, recipient, retry, onChanged }: { campaign: Campaign; recipient: CampaignRecipient; retry: () => void; onChanged: () => void }) {
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [decision, setDecision] = useState<'confirm_not_accepted' | 'confirm_accepted'>('confirm_not_accepted');
  const [note, setNote] = useState('');
  const [providerMessageId, setProviderMessageId] = useState('');
  const reconcile = useMutation({
    mutationFn: () => messagingApi.reconcileRecipient(campaign._id, recipient._id, { decision, note, ...(decision === 'confirm_accepted' ? { providerMessageId } : {}) }),
    onSuccess: () => { setReconcileOpen(false); onChanged(); showSuccess('Outcome reconciled and audited'); }, onError: showError,
  });
  const lead = typeof recipient.leadId === 'object' ? recipient.leadId : null;
  const explicitlyReconciled = recipient.error?.code === 'RECONCILED_NOT_ACCEPTED';
  const retryable = ['failed', 'undelivered'].includes(recipient.status)
    && (explicitlyReconciled || (recipient.latestAttempt?.outcome !== 'ambiguous' && recipient.latestAttempt?.failureClass !== 'permanent'));
  return (
    <>
      <TableRow>
        <TableCell><p className="max-w-40 truncate font-medium">{lead?.name || 'Lead'}</p><p className="text-xs text-muted-foreground">{lead?.leadNumber || ''}</p><details className="mt-2 max-w-sm text-xs"><summary className="cursor-pointer text-primary">Message details</summary><dl className="mt-2 space-y-2"><div><dt className="text-muted-foreground">Recipient</dt><dd>{recipient.destination || 'Unavailable'}</dd></div><div><dt className="text-muted-foreground">Personalized SMS</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{recipient.rendered?.bodyText || 'Content unavailable'}</dd></div><div><dt className="text-muted-foreground">Sent at</dt><dd>{recipient.sentAt ? new Date(recipient.sentAt).toLocaleString() : 'No sending evidence'}</dd></div><div><dt className="text-muted-foreground">Delivered at</dt><dd>{recipient.deliveredAt ? new Date(recipient.deliveredAt).toLocaleString() : 'No delivery receipt'}</dd></div><div><dt className="text-muted-foreground">Provider message ID</dt><dd className="break-all font-mono">{recipient.providerMessageId || 'Not assigned'}</dd></div></dl></details></TableCell>
        <TableCell><StatusBadge status={recipient.status} />{recipient.error?.message && <p className="mt-1 max-w-48 truncate text-xs text-destructive" title={recipient.error.message}>{recipient.error.message}</p>}</TableCell>
        <TableCell><p className="text-xs">{recipient.provider || '—'}</p>{recipient.fallbackFrom && <p className="text-[11px] text-muted-foreground">fallback from {recipient.fallbackFrom}</p>}</TableCell>
        <TableCell className="text-end">{retryable && <Button size="sm" variant="ghost" onClick={retry}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>}{recipient.status === 'unknown' && <Button size="sm" variant="outline" onClick={() => setReconcileOpen(true)}>Reconcile</Button>}</TableCell>
      </TableRow>
      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}><DialogContent><DialogHeader><DialogTitle>Reconcile unknown submission</DialogTitle><DialogDescription>Confirm the outcome from provider evidence. This decision is audit logged; unknown messages are never retried automatically.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Decision</Label><Select value={decision} onValueChange={(value) => setDecision(value as typeof decision)}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="confirm_not_accepted">Provider confirmed not accepted</SelectItem><SelectItem value="confirm_accepted">Provider confirmed accepted</SelectItem></SelectContent></Select></div>{decision === 'confirm_accepted' && <div><Label>Provider message ID</Label><Input className="mt-1.5" value={providerMessageId} onChange={(event) => setProviderMessageId(event.target.value)} /></div>}<div><Label>Evidence / note</Label><Textarea className="mt-1.5" value={note} onChange={(event) => setNote(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setReconcileOpen(false)}>Cancel</Button><Button disabled={!note.trim() || (decision === 'confirm_accepted' && !providerMessageId.trim()) || reconcile.isPending} onClick={() => reconcile.mutate()}>Record decision</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}

type TemplateForm = Omit<MessageTemplate, '_id' | 'createdBy' | 'isArchived'>;

const emptyTemplate: TemplateForm = {
  name: '', channel: 'email', purpose: 'promotional', category: 'custom',
  description: '', subject: '', bodyText: '', bodyHtml: '', isShared: false,
};

function TemplatesPanel() {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission('crm:write');
  const canSyncMeta = hasPermission('settings:admin');
  const currentUserId = useAuthStore((state: { user?: { _id?: string; id?: string } | null }) => (
    state.user?._id ?? state.user?.id ?? null
  ));
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MessageTemplate | null | 'new'>(null);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('all');
  const templates = useQuery({ queryKey: ['messaging', 'templates', 'all'], queryFn: () => messagingApi.listTemplates() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['messaging', 'templates'] });
  const duplicate = useMutation({ mutationFn: messagingApi.duplicateTemplate, onSuccess: () => { refresh(); showSuccess('Template duplicated'); }, onError: showError });
  const archive = useMutation({ mutationFn: messagingApi.archiveTemplate, onSuccess: () => { refresh(); showSuccess('Template archived'); }, onError: showError });
  const syncMeta = useMutation({ mutationFn: messagingApi.syncMetaTemplates, onSuccess: (result) => { refresh(); showSuccess(`${result.synced} Meta templates synchronized`); }, onError: showError });
  const visibleTemplates = (templates.data ?? []).filter((template) => {
    if (channel !== 'all' && template.channel !== channel) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || `${template.name} ${template.description || ''} ${template.category || ''}`.toLocaleLowerCase().includes(term);
  });
  return <Card className="overflow-hidden border-border/70 shadow-sm">
    <CardHeader className="border-b border-border/70 pb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><CardTitle>Template library</CardTitle><p className="mt-1 text-sm text-muted-foreground">Create consistent, personalized content for every channel and campaign purpose.</p></div>
        <div className="flex flex-wrap gap-2">{canSyncMeta && <Button variant="outline" onClick={() => syncMeta.mutate()} disabled={syncMeta.isPending}><RefreshCw className={cn('h-4 w-4', syncMeta.isPending && 'animate-spin')} /> Sync Meta</Button>}{canWrite && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New template</Button>}</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px]">
        <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search templates" className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, purpose, or category…" /></div>
        <Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label="Filter templates by channel"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select>
      </div>
    </CardHeader>
    <CardContent className="p-5">
      {templates.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-56 rounded-xl" />)}</div> : templates.isError ? <EmptyState icon={AlertCircle} title="Templates could not be loaded" description="Retry the request to restore your shared template library." action={<Button variant="outline" onClick={() => void templates.refetch()}>Try again</Button>} /> : visibleTemplates.length === 0 ? <EmptyState className="min-h-64" icon={Mail} title={templates.data?.length ? 'No templates match these filters' : 'Build your reusable template library'} description={templates.data?.length ? 'Clear the search or choose another channel.' : 'Create compliant Email and SMS content here. Approved WhatsApp structures are synchronized directly from Meta.'} action={canWrite ? <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Create template</Button> : undefined} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTemplates.map((template) => {
            const Icon = channelIcon[template.channel];
            const isApproved = template.channel === 'whatsapp' && template.whatsapp?.approvalStatus === 'approved';
            const canManage = canWrite && canManageTemplate(template, currentUserId);
            return <Card key={template._id} className="group overflow-hidden border-border/70 bg-muted/[0.12] shadow-none transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"><CardContent className="p-0"><div className="h-1 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" /><div className="p-4"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div className="flex gap-1.5"><Badge variant="outline" className="capitalize">{channelLabel[template.channel]}</Badge>{template.isShared && <Badge variant="outline">Shared</Badge>}</div></div><h3 className="mt-4 truncate font-semibold">{template.name}</h3><p dir="auto" className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{template.description || template.bodyText || template.subject || 'No message preview yet.'}</p><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span className="capitalize">{template.category || 'Custom'}</span>{template.channel === 'whatsapp' && <span className={cn('inline-flex items-center gap-1 font-medium', isApproved ? 'text-emerald-600' : 'text-amber-600')}>{isApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{template.whatsapp?.approvalStatus || 'Unapproved'}</span>}</div>{canWrite && <div className="mt-4 flex gap-2 border-t border-border/70 pt-3">{canManage && <Button size="sm" variant="outline" onClick={() => setEditing(template)}>Edit</Button>}<Button size="sm" variant="ghost" onClick={() => duplicate.mutate(template._id)}><Copy className="h-3.5 w-3.5" /> Duplicate</Button>{canManage && <Button aria-label={`Archive ${template.name}`} size="sm" variant="ghost" className="ms-auto" onClick={() => archive.mutate(template._id)}><Archive className="h-3.5 w-3.5" /></Button>}</div>}</div></CardContent></Card>;
          })}
        </div>
      )}
      <TemplateDialog value={editing} onOpenChange={setEditing} onSaved={refresh} />
    </CardContent>
  </Card>;
}

function TemplateDialog({ value, onOpenChange, onSaved }: { value: MessageTemplate | null | 'new'; onOpenChange: (value: MessageTemplate | null | 'new') => void; onSaved: () => void }) {
  const initial: TemplateForm = value && value !== 'new' ? value : emptyTemplate;
  const [tracked, setTracked] = useState(value);
  const [form, setForm] = useState<TemplateForm>(initial);
  if (tracked !== value) { setTracked(value); setForm(value && value !== 'new' ? value : emptyTemplate); }
  const syncedMeta = form.channel === 'whatsapp' && Boolean(form.whatsapp?.providerDefinition);
  const save = useMutation({
    mutationFn: () => {
      const metadata = {
        name: form.name, channel: form.channel, purpose: form.purpose,
        category: form.category || 'custom', description: form.description || '',
        isShared: Boolean(form.isShared),
        ...(form.channel === 'whatsapp' ? { whatsapp: { twilioContentSid: form.whatsapp?.twilioContentSid || null } } : {}),
      };
      const payload = syncedMeta ? metadata : {
        ...metadata,
        subject: form.subject || '', bodyHtml: form.bodyHtml || '', bodyText: form.bodyText || '',
      };
      return value !== 'new' && value ? messagingApi.updateTemplate(value._id, payload) : messagingApi.createTemplate(payload);
    },
    onSuccess: () => { onSaved(); onOpenChange(null); showSuccess('Template saved'); }, onError: showError,
  });
  const patch = (next: Partial<typeof form>) => setForm((current) => ({ ...current, ...next }));
  return (
    <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{value === 'new' ? 'New message template' : 'Edit message template'}</DialogTitle>
          <DialogDescription>WhatsApp drafts remain separate from Meta-synchronized approved templates.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-1 sm:grid-cols-2">
          <div><Label>Name</Label><Input className="mt-1.5" value={form.name} onChange={(event) => patch({ name: event.target.value })} /></div>
          <div><Label>Channel</Label><Select value={form.channel} disabled={value !== 'new'} onValueChange={(channel) => patch({ channel: channel as OutreachChannel })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select></div>
          <div><Label>Purpose</Label><Select value={form.purpose} onValueChange={(purpose) => patch({ purpose: purpose as OutreachPurpose })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="promotional">Promotional</SelectItem><SelectItem value="transactional">Transactional</SelectItem><SelectItem value="support">Support</SelectItem></SelectContent></Select></div>
          <div><Label>Category</Label><Input className="mt-1.5" value={form.category || ''} onChange={(event) => patch({ category: event.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Description</Label><Input className="mt-1.5" value={form.description || ''} onChange={(event) => patch({ description: event.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={Boolean(form.isShared)} onChange={(event) => patch({ isShared: event.target.checked })} />Share this template with CRM users</label>
          {form.channel === 'whatsapp' && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm sm:col-span-2">
              {syncedMeta
                ? <><p className="font-medium">Meta-approved structure is read-only</p><p className="mt-1 text-xs text-muted-foreground">{form.whatsapp?.metaName} · {form.whatsapp?.language} · {form.whatsapp?.approvalStatus}</p></>
                : <><p className="font-medium">Ordinary WhatsApp draft</p><p className="mt-1 text-xs text-muted-foreground">This content cannot be sent until a corresponding approved template is synchronized from Meta.</p></>}
            </div>
          )}
          {form.channel === 'whatsapp' && syncedMeta && <div className="sm:col-span-2"><Label>Twilio fallback Content SID</Label><Input className="mt-1.5 font-mono" value={form.whatsapp?.twilioContentSid || ''} onChange={(event) => patch({ whatsapp: { ...form.whatsapp, twilioContentSid: event.target.value.trim() || null } })} placeholder="HX… (optional approved Twilio template)" /><p className="mt-1.5 text-xs text-muted-foreground">Required only when the administrator enables WhatsApp fallback. It does not modify the Meta-approved template.</p></div>}
          {form.channel === 'email' && <div className="sm:col-span-2"><Label>Subject</Label><Input className="mt-1.5" value={form.subject || ''} onChange={(event) => patch({ subject: event.target.value })} /></div>}
          <div className="sm:col-span-2"><Label>{form.channel === 'whatsapp' ? 'Message preview' : 'Plain-text content'}</Label><Textarea dir="auto" readOnly={syncedMeta} className="mt-1.5 min-h-36" value={form.bodyText || ''} onChange={(event) => patch({ bodyText: event.target.value })} /></div>
          {form.channel === 'email' && <div className="sm:col-span-2"><Label>HTML content</Label><Textarea className="mt-1.5 min-h-44 font-mono text-xs" value={form.bodyHtml || ''} onChange={(event) => patch({ bodyHtml: event.target.value })} placeholder={'<table role="presentation">...</table>'} /></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(null)}>Cancel</Button><Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>Save template</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnalyticsPanel() {
  const [preset, setPreset] = useState<AnalyticsPreset>('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const params = useMemo(() => buildAnalyticsParams(range), [range]);
  const analytics = useQuery({
    queryKey: ['messaging', 'analytics', params],
    queryFn: () => messagingApi.analytics(params || {}),
    enabled: params !== null,
    refetchInterval: 15000,
  });
  const exportMutation = useMutation({
    mutationFn: () => messagingApi.exportAnalytics(params || {}),
    onSuccess: (blob) => downloadBlob(blob, `messaging-analytics-${range.from || 'all'}-${range.to || 'now'}.csv`),
    onError: showError,
  });
  const data = analytics.data;
  const cards = [
    { label: 'Campaigns', value: data?.campaigns ?? 0, icon: Layers3, tone: 'text-blue-600 bg-blue-500/10' },
    { label: 'Recipients', value: data?.totalRecipients ?? 0, icon: Users, tone: 'text-violet-600 bg-violet-500/10' },
    { label: 'Submitted', value: data?.submitted ?? 0, icon: Send, tone: 'text-cyan-600 bg-cyan-500/10' },
    { label: 'Delivered', value: data?.delivered ?? 0, icon: CheckCircle2, tone: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'WhatsApp reads', value: data?.read ?? 0, icon: Eye, tone: 'text-teal-600 bg-teal-500/10' },
    { label: 'Email bounces', value: data?.emailBounced ?? 0, icon: Mail, tone: 'text-rose-600 bg-rose-500/10' },
    { label: 'Inbound replies', value: data?.inboundReplies ?? 0, icon: MessageCircle, tone: 'text-indigo-600 bg-indigo-500/10' },
    { label: 'SMS fallbacks', value: data?.fallbackCount ?? 0, icon: RotateCcw, tone: 'text-amber-600 bg-amber-500/10' },
  ];
  const changePreset = (value: string) => {
    const next = value as AnalyticsPreset;
    setPreset(next);
    if (next !== 'custom') setRange(analyticsPresetRange(next));
  };
  return (
    <div className="space-y-5">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div><Label>Reporting period</Label><Select value={preset} onValueChange={changePreset}><SelectTrigger className="mt-1.5" aria-label="Analytics reporting period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All time</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="90d">Last 90 days</SelectItem><SelectItem value="custom">Custom range</SelectItem></SelectContent></Select></div>
            <div><Label htmlFor="analytics-from">From</Label><Input id="analytics-from" className="mt-1.5" type="date" value={range.from} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, from: event.target.value })); }} /></div>
            <div><Label htmlFor="analytics-to">To</Label><Input id="analytics-to" className="mt-1.5" type="date" value={range.to} onChange={(event) => { setPreset('custom'); setRange((current) => ({ ...current, to: event.target.value })); }} /></div>
          </div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => void analytics.refetch()} disabled={!params || analytics.isFetching}><RefreshCw className={cn('h-4 w-4', analytics.isFetching && 'animate-spin')} /> Refresh</Button><Button variant="outline" onClick={() => exportMutation.mutate()} disabled={!params || exportMutation.isPending}><Download className="h-4 w-4" /> Export CSV</Button></div>
        </CardContent>
        {!isAnalyticsRangeValid(range) && <div role="alert" className="border-t border-rose-500/20 bg-rose-500/[0.06] px-4 py-2 text-xs text-rose-600">The start date must be before or equal to the end date.</div>}
      </Card>

      {analytics.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : analytics.isError ? <Card><EmptyState icon={AlertCircle} title="Analytics could not be loaded" description="Delivery evidence remains stored. Retry the reporting request to view the latest aggregates." action={<Button variant="outline" onClick={() => void analytics.refetch()}>Try again</Button>} /></Card> : <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => { const Icon = item.icon; return <Card key={item.label} className="border-border/70 shadow-sm"><CardContent className="p-4"><div className={cn('mb-4 flex h-9 w-9 items-center justify-center rounded-xl', item.tone)}><Icon className="h-4 w-4" /></div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{compactNumber(item.value)}</p></CardContent></Card>; })}
      </div>
      {data && (
        <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle>Usage and compliance</CardTitle><p className="mt-1 text-sm text-muted-foreground">Quota consumption and recipient-protection controls for the current period.</p></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2"><UsageBar label="Daily usage" value={data.usage.daily} limit={data.quotas.daily} /></div>
          <div className="xl:col-span-2"><UsageBar label="Monthly usage" value={data.usage.monthly} limit={data.quotas.monthly} /></div>
          <ComplianceMetric label="Frequency blocked" value={data.compliance.frequencyBlocked} />
          <ComplianceMetric label="Consent expiring ≤30d" value={data.compliance.expiringConsents} />
          <ComplianceMetric label="Expired consent" value={data.compliance.expiredConsents} />
          <ComplianceMetric label="Suppressed destinations" value={data.compliance.suppressedDestinations} />
        </CardContent></Card>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle>Channel delivery</CardTitle><p className="mt-1 text-sm text-muted-foreground">Verified evidence uses submitted outcomes—not drafts—as its denominator.</p></CardHeader><CardContent className="space-y-5">{(data?.byChannel ?? []).length ? data!.byChannel.map((row) => { const Icon = channelIcon[row._id as OutreachChannel] || MessageSquareText; const rate = row.submitted ? (row.delivered / row.submitted) * 100 : 0; return <div key={row._id}><div className="mb-2 flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2 font-medium capitalize"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted"><Icon className="h-3.5 w-3.5" /></span>{row._id}</span><span className="text-xs text-muted-foreground"><strong className="text-foreground">{Math.round(rate)}%</strong> · {row.delivered}/{row.submitted} submitted</span></div><Progress value={rate} className="h-2" /><div className="mt-1 flex gap-3 text-[11px] text-muted-foreground"><span>{row.failed} failed</span>{row._id === 'whatsapp' && <span>{row.read} read</span>}{row._id === 'email' && <span>{row.bounced} bounced</span>}</div></div>; }) : <EmptyState className="py-8" icon={BarChart3} title="No channel evidence yet" description="Delivery rates will appear after the first campaign is submitted." />}</CardContent></Card>
        <Card className="overflow-hidden border-border/70 shadow-sm"><CardHeader><CardTitle>Provider outcomes and cost</CardTitle><p className="mt-1 text-sm text-muted-foreground">Currencies remain separate; actual cost is never inferred from configured estimates.</p></CardHeader><CardContent className="p-0">{(data?.byProvider ?? []).length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-end">Submitted</TableHead><TableHead className="text-end">Delivered</TableHead><TableHead className="text-end">Failed</TableHead><TableHead>Cost evidence</TableHead></TableRow></TableHeader><TableBody>{data!.byProvider.map((row) => <TableRow key={row._id}><TableCell className="font-medium capitalize">{row._id.replaceAll('_', ' ')}</TableCell><TableCell className="text-end tabular-nums">{row.submitted}</TableCell><TableCell className="text-end tabular-nums text-emerald-600">{row.delivered}</TableCell><TableCell className="text-end tabular-nums text-rose-600">{row.failed}</TableCell><TableCell className="min-w-52 text-xs text-muted-foreground">{formatCostBuckets(row.costs)}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState className="py-8" icon={Activity} title="No provider outcomes yet" description="Provider performance and cost evidence will appear after submission." />}</CardContent></Card>
      </div>
      <Card className="overflow-hidden border-border/70 shadow-sm"><CardHeader><CardTitle>Status evidence</CardTitle><p className="mt-1 text-sm text-muted-foreground">Every state is shown separately so queued, accepted, delivered, failed, and unknown outcomes are never conflated.</p></CardHeader><CardContent className="flex flex-wrap gap-2">{(data?.byStatus ?? []).length ? data!.byStatus.sort((a, b) => b.count - a.count).map((row) => <div key={row._id} className="flex min-w-32 items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 px-3 py-2"><StatusBadge status={row._id} /><span className="font-semibold tabular-nums">{row.count}</span></div>) : <p className="text-sm text-muted-foreground">No status evidence for this period.</p>}</CardContent></Card>
      <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Delivery rates use submitted recipients as the denominator. Actual costs appear only when a provider returns reliable evidence; configured rates remain estimates. TextBee platform allowance never implies free carrier or SIM usage.</p></div>
      </>}
    </div>
  );
}

function UsageBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const percentage = Math.min(100, limit ? (value / limit) * 100 : 100);
  return <div className="rounded-xl border border-border/70 bg-muted/20 p-4"><div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{compactNumber(value)} / {compactNumber(limit)}</span></div><Progress className="mt-3 h-2" value={percentage} /><p className="mt-2 text-[11px] text-muted-foreground">{Math.round(percentage)}% of configured allowance</p></div>;
}

function ComplianceMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-border/70 bg-muted/20 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>;
}

export function OutreachCenter() {
  const { hasPermission } = usePermissions();
  return <div data-testid="outreach-scroll-container" className={cn(outreachScrollContainerClassName, 'space-y-6 p-4 pb-10 sm:p-6 sm:pb-12')}>
    <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-primary/10 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <Badge variant="outline" className="mb-3 gap-1.5 border-primary/20 bg-primary/[0.06] text-primary"><Sparkles className="h-3.5 w-3.5" /> Revenue operations</Badge>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Outreach center</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Plan personalized conversations, monitor delivery evidence, and manage every lead touchpoint across Email, SMS, and WhatsApp.</p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Consent-aware</span>
            <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-blue-600" /> Live delivery evidence</span>
            <span className="inline-flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5 text-violet-600" /> Safe provider routing</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {hasPermission('settings:admin') && <Button asChild variant="outline" className="bg-background/70"><Link href="/admin/messaging"><Settings className="h-4 w-4" /> Provider settings</Link></Button>}
          {hasPermission('crm:write') && <Button asChild className="shadow-sm"><Link href="/leads"><Plus className="h-4 w-4" /> New campaign</Link></Button>}
        </div>
      </div>
    </section>

    <Tabs defaultValue="campaigns">
      <TabsList className="h-auto rounded-xl border border-border/70 bg-card p-1 shadow-sm">
        <TabsTrigger className="rounded-lg px-4 py-2" value="campaigns"><MessageSquareText className="h-4 w-4" /> Campaigns</TabsTrigger>
        <TabsTrigger className="rounded-lg px-4 py-2" value="templates"><Mail className="h-4 w-4" /> Templates</TabsTrigger>
        <TabsTrigger className="rounded-lg px-4 py-2" value="analytics"><BarChart3 className="h-4 w-4" /> Analytics</TabsTrigger>
      </TabsList>
      <TabsContent value="campaigns" className="mt-5"><CampaignsPanel /></TabsContent>
      <TabsContent value="templates" className="mt-5"><TemplatesPanel /></TabsContent>
      <TabsContent value="analytics" className="mt-5"><AnalyticsPanel /></TabsContent>
    </Tabs>
  </div>;
}
