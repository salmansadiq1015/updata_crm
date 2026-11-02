'use client';

import { useState, type ReactElement } from 'react';
import {
  X, Pause, Square, RotateCcw, FlaskConical, ListChecks, Phone, Loader2, Download, Mic, MessageSquareText, Pencil, Trash2, Clock3,
} from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';
import { useCampaign, useCampaignMutations, useCampaignRunStatus, useRecipients, useRemoveRecipients } from '../hooks/use-ai-calling';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { SimulateConsole } from './simulate-console';
import { WebCallConsole } from './web-call-console';
import { CallReviewDrawer } from './call-review-drawer';
import { LinkAssistantPanel } from './link-assistant-panel';
import { StatusPill } from './status-pill';
import { deviceWaitSentence } from './paired-call-health';
import { RECIPIENT_ACTIVE_STATES, RecipientReasons } from './campaign-lead-picker';
import { LiveCallsPanel } from './live-calls-panel';
import { CallDetailDrawer } from './call-detail-drawer';
import { CampaignCallingStatus } from './campaign-run-status';
import { ContactLimitSkips } from '@/modules/smsOps/ui/contact-limit-skips';
import { usePermissions } from '@/shared/hooks/use-permissions';
import type { Campaign } from '../types/ai-calling-types';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

type Tab = 'live' | 'overview' | 'recipients' | 'configuration' | 'simulate' | 'webtest' | 'link';

export function CampaignDetailDrawer({ campaignId, onClose, onEdit }: { campaignId: string; onClose: () => void; onEdit?: (campaign: Campaign) => void }) {
  const { isAdmin, hasPermission } = usePermissions();
  const canManage = isAdmin || ['ai-calling:write', 'ai-calling:admin', 'crm:write', 'crm:admin'].some(hasPermission);
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId);
  const { data: readiness } = useCampaignRunStatus(campaignId, Boolean(campaign && campaign.channel !== 'web_link'));
  const { start, pause, resume, cancel, retry } = useCampaignMutations();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [liveCallId, setLiveCallId] = useState<string | null>(null);

  // Live push updates for this campaign (summary, per-call state, answers).
  useAiCallingRealtime(campaignId);

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await aiCallingApi.exportCsv(campaignId);
      downloadBlob(blob, `ai-call-campaign-${campaignId}.csv`, 'text/csv;charset=utf-8');
    } catch (e) { showError(e); } finally { setExporting(false); }
  }

  const s = campaign?.summary;
  const isLink = campaign?.channel === 'web_link';
  const canStart = campaign && (campaign.status === 'draft' || campaign.status === 'scheduled'
    || (!isLink && campaign.status === 'running' && (campaign.runMode !== 'immediate' || ['calling_hours', 'recipient_quiet_hours'].includes(campaign.waitReason || ''))));
  const startBlocked = !isLink && readiness?.canStart === false;
  const canPause = campaign && ['running', 'queued', 'scheduled'].includes(campaign.status);
  // One lifecycle request at a time: a double click must not fire two transitions.
  const busy = start.isPending || pause.isPending || resume.isPending || cancel.isPending || retry.isPending;
  const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div role="region" aria-label="Campaign details" className="flex h-full w-full max-w-3xl flex-col border-l border-border bg-card shadow-theme-lg" onMouseDown={(e) => e.stopPropagation()}>
        {isError && !campaign ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">This campaign could not be loaded.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => refetch()} className={`${btn} border border-border hover:bg-muted`}>Try again</button>
              <button type="button" onClick={onClose} className={`${btn} border border-border hover:bg-muted`}>Close</button>
            </div>
          </div>
        ) : isLoading || !campaign ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* header */}
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-bold">{campaign.name}</h2>
                    <StatusPill status={readiness?.displayStatus || (campaign.status === 'running' ? campaign.summary.inProgress ? 'calling' : campaign.waitReason ? 'waiting' : 'queued' : campaign.status)} />
                    {campaign.isTest ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">TEST</span> : null}
                  </div>
                  {campaign.description ? <p className="mt-0.5 text-xs text-muted-foreground">{campaign.description}</p> : null}
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>

              {/* lifecycle actions */}
              <div className="mt-3 flex flex-wrap gap-2">
                {canStart ? (
                  <button type="button" disabled={busy || !canManage || startBlocked} title={startBlocked ? readiness?.blockers[0]?.message : undefined} onClick={() => start.mutate({ id: campaignId, scheduledAt: null, startNow: !isLink })} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
                    {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />} {isLink ? 'Start campaign' : campaign.status === 'running' || campaign.status === 'scheduled' ? 'Start calling now' : 'Start calling'}
                  </button>
                ) : null}
                {campaign.status === 'paused' ? (
                  <button type="button" disabled={busy || !canManage || startBlocked} title={startBlocked ? readiness?.blockers[0]?.message : undefined} onClick={() => resume.mutate(campaignId)} className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>
                    {resume.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />} {isLink ? 'Resume campaign' : 'Start calling'}
                  </button>
                ) : null}
                {!isLink && ['draft', 'paused', 'scheduled'].includes(campaign.status) ? <button type="button" disabled={busy || !canManage || startBlocked} onClick={() => start.mutate({ id: campaignId, startNow: false, scheduledAt: campaign.scheduledAt && Date.parse(campaign.scheduledAt) > Date.now() ? campaign.scheduledAt : null })} className={`${btn} border border-border hover:bg-muted`}><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Start on schedule</button> : null}
                {canPause ? (
                  <button type="button" disabled={busy || !canManage} onClick={() => pause.mutate(campaignId)} className={`${btn} border border-border hover:bg-muted`}>
                    {pause.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} {isLink ? 'Pause campaign' : 'Pause calling'}
                  </button>
                ) : null}
                {!campaign.agentId && ['draft', 'paused'].includes(campaign.status) && onEdit ? (
                  <button type="button" disabled={busy || !canManage} onClick={() => onEdit(campaign)} className={`${btn} border border-border hover:bg-muted`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                ) : null}
                {['completed', 'running', 'paused'].includes(campaign.status) ? (
                  <button
                    type="button"
                    disabled={busy || !canManage}
                    onClick={() => retry.mutate(campaignId)}
                    title={`${campaign.status === 'paused' ? 'Re-queues failed/exhausted leads; the campaign stays paused until you resume it' : 'Re-queue failed and exhausted leads'}. Calls with an unknown outcome are not included: resolve each one from Recipients.`}
                    className={`${btn} border border-border hover:bg-muted`}
                  >
                    {retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry failed
                  </button>
                ) : null}
                {!['completed', 'cancelled'].includes(campaign.status) ? (
                  <button type="button" disabled={busy || !canManage} onClick={() => setConfirmCancel(true)} className={`${btn} border border-border text-rose-600 hover:bg-rose-500/10`}>
                    <Square className="h-3.5 w-3.5" /> Cancel
                  </button>
                ) : null}
                <button type="button" onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
              {[start.error, resume.error, pause.error, retry.error, cancel.error].filter(Boolean).slice(0, 1).map((error, i) => <p key={i} role="alert" className="mt-2 text-xs text-rose-600">{(error as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message || (error as Error).message || 'Could not update calling. Refresh the campaign and try again.'}</p>)}
            </div>

            {/* tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none]" role="tablist" aria-label="Campaign sections">
              {!isLink && <TabButton active={tab === 'live'} onClick={() => setTab('live')} icon={MessageSquareText} label="Live calls" />}
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={ListChecks} label="Overview" />
              {isLink ? <TabButton active={tab === 'link'} onClick={() => setTab('link')} icon={MessageSquareText} label="SMS link chats" /> : null}
              <TabButton active={tab === 'recipients'} onClick={() => setTab('recipients')} icon={Phone} label="Recipients" />
              <TabButton active={tab === 'configuration'} onClick={() => setTab('configuration')} icon={ListChecks} label="Configuration" />
              <TabButton active={tab === 'simulate'} onClick={() => setTab('simulate')} icon={FlaskConical} label="Simulate" />
              {!isLink || campaign.linkConfig?.voiceTier === 'premium' ? (
                <TabButton active={tab === 'webtest'} onClick={() => setTab('webtest')} icon={Mic} label="Live test" />
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4"><CampaignCallingStatus campaign={campaign} /></div>
              {campaign.channel !== 'web_link' ? <ContactLimitSkips source="ai_calling" campaignId={campaignId} className="mb-4" /> : null}
              {tab === 'live' && <LiveCallsPanel campaignId={campaignId} active={['running', 'queued'].includes(campaign.status) || (s?.inProgress || 0) > 0} onPreview={setLiveCallId} />}
              {tab === 'overview' && s ? (
                <div className="space-y-4">
                  {campaign.transport === 'paired_phone' && campaign.status === 'running' && !s.inProgress && campaign.deviceWait?.reasons?.length ? (
                    <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">{deviceWaitSentence(campaign.deviceWait.reasons).blocking ? 'Your paired phone needs attention' : 'Waiting for your paired phone'}</p>
                      <p className="mt-0.5 text-muted-foreground">{deviceWaitSentence(campaign.deviceWait.reasons).text} No lead is called until it is ready.</p>
                    </div>
                  ) : null}
                  <LiveCallsPanel campaignId={campaignId} active={['running', 'queued'].includes(campaign.status) || s.inProgress > 0} onPreview={setLiveCallId} />
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Total" value={s.total} />
                    <Metric label="Eligible" value={s.eligible} />
                    <Metric label="In progress" value={s.inProgress} accent="amber" />
                    <Metric label="Completed" value={s.completed} accent="brand" />
                    <Metric label="Answered" value={s.answered} accent="emerald" />
                    <Metric label="No answer" value={s.noAnswer} />
                    <Metric label="Qualified" value={s.qualified} accent="emerald" />
                    <Metric label="Unqualified" value={s.unqualified} />
                    <Metric label="Callbacks" value={s.callbacks} accent="blue" />
                    <Metric label="Needs review" value={s.needsReview} accent="rose" />
                    <Metric label="Do not contact" value={s.doNotContact} accent="rose" />
                    <Metric label="Missing phone" value={s.missingPhone} />
                    <Metric label="Needs consent" value={s.consentRequired ?? 0} accent="amber" />
                    <Metric label="Outcome unknown" value={s.needsReconcile ?? 0} accent="amber" />
                    <Metric label="Failed" value={s.failed} accent="rose" />
                    <Metric label="Retry scheduled" value={s.retryScheduled} />
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                    <p><strong className="text-foreground">{campaign.questionnaire.questions.length}</strong> questions · <strong className="text-foreground">{campaign.statusRules.length}</strong> rules · agent <strong className="text-foreground">{campaign.agentConfig.agentName}</strong> ({campaign.agentConfig.voice})</p>
                    <p className="mt-1">Total talk time: {Math.round((s.totalCallSeconds || 0) / 60)}m · Est. cost: ${Number(s.actualCost || 0).toFixed(2)}</p>
                  </div>
                </div>
              ) : null}

              {tab === 'link' ? <LinkAssistantPanel campaignId={campaignId} /> : null}
              {tab === 'configuration' ? <CampaignConfiguration campaign={campaign} /> : null}
              {tab === 'recipients' ? <RecipientsTab campaignId={campaignId} /> : null}
              {tab === 'simulate' ? <div className="h-full"><SimulateConsole campaignId={campaignId} /></div> : null}
              {tab === 'webtest' ? <div className="h-full"><WebCallConsole campaignId={campaignId} /></div> : null}
            </div>
          </>
        )}
      </div>

      {liveCallId && <CallDetailDrawer callId={liveCallId} onClose={() => setLiveCallId(null)} />}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel campaign?"
        description="Pending calls will be stopped. Calls already in progress are left to finish and reconcile."
        confirmText="Cancel campaign"
        cancelText="Keep running"
        variant="destructive"
        isLoading={cancel.isPending}
        // Keep the dialog (and its spinner) up until the server confirms.
        onConfirm={() => cancel.mutate(campaignId, { onSettled: () => setConfirmCancel(false) })}
      />
    </div>
  );
}

function CampaignConfiguration({ campaign }: { campaign: Campaign }) {
  const date = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { timeZone: campaign.schedule.timezone || 'UTC' }) : '—';
  return <div className="space-y-4 text-sm"><div className="rounded-xl border border-border p-3"><h3 className="font-semibold">Saved campaign configuration</h3><p className="mt-1 text-xs text-muted-foreground">{campaign.agentId ? `Agent version ${campaign.agentSnapshot?.version ?? '—'}. Later agent edits do not change this run.` : 'Legacy campaign. Its original configuration and results are retained.'}</p></div>
    <dl className="grid grid-cols-2 gap-3 text-xs">{[
      ['Agent', campaign.agentSnapshot?.name || campaign.agentConfig.agentName], ['Role', campaign.agentSnapshot?.title || '—'], ['Voice', campaign.agentConfig.voice || '—'], ['Language', campaign.agentConfig.language || '—'], ['Transport', campaign.transport === 'paired_phone' ? 'Paired phone' : 'Cloud SIP'], ['Calling hours', `${campaign.schedule.callWindow?.start}–${campaign.schedule.callWindow?.end}`], ['Timezone', campaign.schedule.timezone || 'UTC'], ['Scheduled launch', date(campaign.scheduledAt)], ['Actual start', date(campaign.startedAt)], ['Completed', date(campaign.completedAt)], ['Execution ends', date(campaign.executionEndsAt)], ['Continuation', campaign.continueAcrossDays ? 'Future permitted days' : 'First permitted window'],
    ].map(([label, value]) => <div key={label} className="rounded-lg border border-border p-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
    <div className="space-y-2 rounded-xl border border-border p-3 text-xs"><h3 className="font-semibold">Instructions</h3><p className="whitespace-pre-line text-muted-foreground">{campaign.agentConfig.objective || 'No objective saved.'}</p><p className="whitespace-pre-line text-muted-foreground">{campaign.agentConfig.disclosure || 'No disclosure saved.'}</p></div>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Questions used for this run</h3>{[...campaign.questionnaire.questions].sort((a, b) => (a.order || 0) - (b.order || 0)).map((q, i) => <div key={q.fieldKey} className="rounded-xl border border-border p-3 text-xs"><p className="font-medium">{i + 1}. {q.label} · {q.type.replaceAll('_', ' ')}{q.required ? ' · Required' : ''}</p><p className="mt-1 text-muted-foreground">{q.text}</p>{q.description && <p className="mt-1 text-muted-foreground">{q.description}</p>}{q.options?.length ? <p className="mt-1 text-muted-foreground">Options: {q.options.map(o => typeof o === 'string' ? o : o.label || o.value).join(', ')}</p> : null}</div>)}</section>
  </div>;
}

const recipientPhone = (r: Record<string, any>): string | null => r.leadId?.mobile || r.leadId?.phone || r.phoneSnapshot || null;

export function RecipientsTab({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useRecipients(campaignId, undefined, page);
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeRecipients = useRemoveRecipients(campaignId);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (isError && !data) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Recipients could not be loaded.{' '}
        <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
      </div>
    );
  }
  const rows = (data?.data ?? []) as Array<Record<string, any>>;
  const pages = data?.pagination?.pages ?? 1;
  if (!rows.length) return <p className="p-4 text-center text-sm text-muted-foreground">No recipients.</p>;

  const removableIds = rows.filter((r) => !RECIPIENT_ACTIVE_STATES.has(r.state)).map((r) => String(r._id));
  const allSelected = removableIds.length > 0 && removableIds.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(removableIds));
  const doRemove = () => removeRecipients.mutate([...selected], { onSettled: () => { setSelected(new Set()); setConfirmRemove(false); } });

  return (
    <>
      {selected.size > 0 ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">Clear</button>
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={removeRecipients.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
              {removeRecipients.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove from campaign
            </button>
          </div>
        </div>
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs uppercase text-muted-foreground">
            <th className="w-8 py-2">
              <input type="checkbox" aria-label="Select all removable recipients" className="h-4 w-4 accent-brand-500" checked={allSelected} disabled={!removableIds.length} onChange={toggleAll} />
            </th>
            <th className="py-2 font-medium">Lead</th>
            <th className="py-2 font-medium">State</th>
            <th className="py-2 font-medium text-end">Attempts</th>
            <th className="py-2 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = String(r._id);
            const callId = r.lastCallId ? String(r.lastCallId) : null;
            const phone = recipientPhone(r);
            const location = [r.leadId?.address?.city, r.leadId?.address?.country].filter(Boolean).join(', ');
            const reasons = (r.eligibility?.reasons ?? []) as string[];
            const removable = !RECIPIENT_ACTIVE_STATES.has(r.state);
            return (
              <tr key={id} className={`border-b border-border/60 ${selected.has(id) ? 'bg-brand-500/5' : ''}`}>
                <td className="py-2 align-top" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.leadId?.name || 'recipient'}`}
                    className="mt-0.5 h-4 w-4 accent-brand-500"
                    checked={selected.has(id)}
                    disabled={!removable}
                    title={removable ? undefined : 'In a call — cannot be removed now'}
                    onChange={() => toggle(id)}
                  />
                </td>
                <td
                  className={`py-2 align-top ${callId ? 'cursor-pointer' : ''}`}
                  onClick={() => callId && setReviewCallId(callId)}
                >
                  <div className="font-medium">{r.leadId?.name || '—'}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {r.leadId?.leadNumber ? <span>{r.leadId.leadNumber}</span> : null}
                    {phone ? <a href={`tel:${phone}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 tabular-nums hover:text-foreground hover:underline"><Phone className="h-3 w-3" />{phone}</a> : <span className="text-rose-600 dark:text-rose-400">No phone</span>}
                    {location ? <span>{location}</span> : null}
                  </div>
                  <RecipientReasons leadId={r.leadId?._id ? String(r.leadId._id) : null} reasons={reasons} />
                </td>
                <td className="py-2 align-top"><StatusPill status={r.state} /></td>
                <td className="py-2 text-end align-top tabular-nums">{r.attemptCount ?? 0}</td>
                <td className="py-2 align-top">
                  {r.qualification ? <StatusPill status={r.qualification} />
                    : r.finalDisposition === 'needs_reconcile' ? <span className="inline-flex items-center gap-1"><StatusPill status="needs_reconcile" /><span className="text-xs font-medium text-brand-600">Resolve</span></span>
                      : <span className="text-xs text-muted-foreground">{r.finalDisposition || '—'}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{pages > 1 ? `Page ${page} of ${pages} · ` : ''}{data?.pagination?.total ?? 0} recipient{(data?.pagination?.total ?? 0) === 1 ? '' : 's'}{isFetching ? ' · updating…' : ''}</span>
        {pages > 1 ? (
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Next</button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${selected.size} recipient${selected.size === 1 ? '' : 's'}?`}
        description="They will no longer be called by this campaign. Any past call history for them is kept. A recipient that is currently in a call is skipped."
        confirmText="Remove"
        cancelText="Keep"
        variant="destructive"
        isLoading={removeRecipients.isPending}
        onConfirm={doRemove}
      />
      {reviewCallId ? <CallReviewDrawer callId={reviewCallId} onClose={() => setReviewCallId(null)} /> : null}
    </>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${active ? 'border-brand-500 text-brand-600 dark:text-brand-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

const ACCENTS: Record<string, string> = {
  default: 'text-foreground', brand: 'text-brand-500', emerald: 'text-emerald-600',
  amber: 'text-amber-600', rose: 'text-rose-600', blue: 'text-blue-600',
};

function Metric({ label, value, accent = 'default' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${ACCENTS[accent]}`}>{value}</p>
    </div>
  );
}
