'use client';

import { useState, type ReactElement } from 'react';
import {
  X, Play, Pause, Square, RotateCcw, FlaskConical, ListChecks, Phone, Loader2, Download, Mic, MessageSquareText, Pencil,
} from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';
import { useActiveCalls, useCampaign, useCampaignMutations, useRecipients } from '../hooks/use-ai-calling';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { SimulateConsole } from './simulate-console';
import { WebCallConsole } from './web-call-console';
import { CallReviewDrawer } from './call-review-drawer';
import { LinkAssistantPanel } from './link-assistant-panel';
import { StatusPill } from './status-pill';
import { DEVICE_WAIT_TEXT, PairedCallHealth } from './paired-call-health';
import { UpdataVoiceOrb, type UpdataVoiceOrbState } from './updata-voice-orb';
import type { Campaign } from '../types/ai-calling-types';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

type Tab = 'overview' | 'recipients' | 'simulate' | 'webtest' | 'link';

export function CampaignDetailDrawer({ campaignId, onClose, onEdit }: { campaignId: string; onClose: () => void; onEdit?: (campaign: Campaign) => void }) {
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId);
  const { start, pause, resume, cancel, retry } = useCampaignMutations();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [exporting, setExporting] = useState(false);

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
  const canStart = campaign && ['draft', 'scheduled'].includes(campaign.status);
  const canPause = campaign && ['running', 'queued', 'scheduled'].includes(campaign.status);
  // One lifecycle request at a time: a double click must not fire two transitions.
  const busy = start.isPending || pause.isPending || resume.isPending || cancel.isPending || retry.isPending;
  const btn = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-theme-lg" onMouseDown={(e) => e.stopPropagation()}>
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
                    <StatusPill status={campaign.status} />
                    {campaign.isTest ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">TEST</span> : null}
                  </div>
                  {campaign.description ? <p className="mt-0.5 text-xs text-muted-foreground">{campaign.description}</p> : null}
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>

              {/* lifecycle actions */}
              <div className="mt-3 flex flex-wrap gap-2">
                {['draft', 'paused'].includes(campaign.status) && onEdit ? (
                  <button type="button" disabled={busy} onClick={() => onEdit(campaign)} className={`${btn} border border-border hover:bg-muted`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                ) : null}
                {canStart ? (
                  <button type="button" disabled={busy} onClick={() => start.mutate({ id: campaignId })} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>
                    {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start
                  </button>
                ) : null}
                {campaign.status === 'paused' ? (
                  <button type="button" disabled={busy} onClick={() => resume.mutate(campaignId)} className={`${btn} bg-brand-500 text-white hover:bg-brand-600`}>
                    {resume.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Resume
                  </button>
                ) : null}
                {canPause ? (
                  <button type="button" disabled={busy} onClick={() => pause.mutate(campaignId)} className={`${btn} border border-border hover:bg-muted`}>
                    {pause.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />} Pause
                  </button>
                ) : null}
                {['completed', 'running', 'paused'].includes(campaign.status) ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => retry.mutate(campaignId)}
                    title={`${campaign.status === 'paused' ? 'Re-queues failed/exhausted leads; the campaign stays paused until you resume it' : 'Re-queue failed and exhausted leads'}. Calls with an unknown outcome are not included: resolve each one from Recipients.`}
                    className={`${btn} border border-border hover:bg-muted`}
                  >
                    {retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry failed
                  </button>
                ) : null}
                {!['completed', 'cancelled'].includes(campaign.status) ? (
                  <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className={`${btn} border border-border text-rose-600 hover:bg-rose-500/10`}>
                    <Square className="h-3.5 w-3.5" /> Cancel
                  </button>
                ) : null}
                <button type="button" onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
            </div>

            {/* tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none]" role="tablist" aria-label="Campaign sections">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={ListChecks} label="Overview" />
              {isLink ? <TabButton active={tab === 'link'} onClick={() => setTab('link')} icon={MessageSquareText} label="SMS link chats" /> : null}
              <TabButton active={tab === 'recipients'} onClick={() => setTab('recipients')} icon={Phone} label="Recipients" />
              <TabButton active={tab === 'simulate'} onClick={() => setTab('simulate')} icon={FlaskConical} label="Simulate" />
              {!isLink || campaign.linkConfig?.voiceTier === 'premium' ? (
                <TabButton active={tab === 'webtest'} onClick={() => setTab('webtest')} icon={Mic} label="Live test" />
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'overview' && s ? (
                <div className="space-y-4">
                  {campaign.transport === 'paired_phone' && campaign.status === 'running' && campaign.deviceWait?.reasons?.length ? (
                    <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                      <p className="font-semibold text-amber-800 dark:text-amber-300">Waiting for your paired phone</p>
                      <p className="mt-0.5 text-muted-foreground">{campaign.deviceWait.reasons.map((r) => DEVICE_WAIT_TEXT[r] || r).join(' · ')}. No lead is called until it is ready.</p>
                    </div>
                  ) : null}
                  <LiveCallsPanel campaignId={campaignId} active={['running', 'queued'].includes(campaign.status) || s.inProgress > 0} />
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
              {tab === 'recipients' ? <RecipientsTab campaignId={campaignId} /> : null}
              {tab === 'simulate' ? <div className="h-full"><SimulateConsole campaignId={campaignId} /></div> : null}
              {tab === 'webtest' ? <div className="h-full"><WebCallConsole campaignId={campaignId} /></div> : null}
            </div>
          </>
        )}
      </div>

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

function LiveCallsPanel({ campaignId, active }: { campaignId: string; active: boolean }) {
  const { data } = useActiveCalls(campaignId, active);
  const calls = data ?? [];
  if (!calls.length) return null;
  return (
    <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-3" aria-live="polite">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" /></span>
        {calls.length} live call activit{calls.length === 1 ? 'y' : 'ies'}
      </div>
      <ul className="space-y-2">
        {calls.map((c) => {
          const orbState: UpdataVoiceOrbState = c.gateway?.audioLost
            ? 'error'
            : ['queued', 'initiating', 'ringing'].includes(c.state)
              ? 'connecting'
              : 'idle';
          return (
          <li key={c.callId} className="rounded-lg border border-white/6 bg-background/60 px-2.5 py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <UpdataVoiceOrb state={orbState} size="compact" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.leadName}{c.isTest ? <span className="ml-1 text-[10px] text-amber-400">TEST</span> : null}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.currentQuestion || c.phase} · {c.answered}/{c.total} answered</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {c.gateway?.audioLost ? 'Audio path lost' : c.gateway?.audioOpen ? 'Bidirectional gateway audio reported' : c.state === 'in_progress' ? 'Call active · speaker state unavailable here' : 'Waiting for connection'}
                  </div>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <StatusPill status={c.state} />
                <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{Math.floor(c.elapsedSeconds / 60)}:{String(c.elapsedSeconds % 60).padStart(2, '0')}</div>
              </div>
            </div>
            {c.transport === 'paired_phone' ? <PairedCallHealth call={c} /> : null}
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecipientsTab({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = useRecipients(campaignId, undefined, page);
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
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
  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 font-medium">Lead</th>
            <th className="py-2 font-medium">State</th>
            <th className="py-2 font-medium text-right">Attempts</th>
            <th className="py-2 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const callId = r.lastCallId ? String(r.lastCallId) : null;
            return (
              <tr
                key={String(r._id)}
                onClick={() => callId && setReviewCallId(callId)}
                className={`border-b border-border/60 ${callId ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              >
                <td className="py-2">
                  <div className="font-medium">{r.leadId?.name || '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.leadId?.leadNumber}</div>
                </td>
                <td className="py-2"><StatusPill status={r.state} /></td>
                <td className="py-2 text-right tabular-nums">{r.attemptCount ?? 0}</td>
                <td className="py-2">
                  {r.qualification ? <StatusPill status={r.qualification} />
                    : r.finalDisposition === 'needs_reconcile' ? <span className="inline-flex items-center gap-1"><StatusPill status="needs_reconcile" /><span className="text-xs font-medium text-brand-600">Resolve</span></span>
                      : <span className="text-xs text-muted-foreground">{r.finalDisposition || '—'}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {pages} · {data?.pagination?.total ?? 0} recipients{isFetching ? ' · updating…' : ''}</span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Previous</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-2 py-1 font-semibold hover:bg-muted disabled:opacity-50">Next</button>
          </div>
        </div>
      ) : null}
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
