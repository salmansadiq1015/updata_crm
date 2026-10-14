'use client';

import { useState, type ReactElement } from 'react';
import {
  X, Play, Pause, Square, RotateCcw, FlaskConical, ListChecks, Phone, Loader2, Download, Mic,
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
import { StatusPill } from './status-pill';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

type Tab = 'overview' | 'recipients' | 'simulate' | 'webtest';

export function CampaignDetailDrawer({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { data: campaign, isLoading } = useCampaign(campaignId);
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
  const canStart = campaign && ['draft', 'paused', 'scheduled'].includes(campaign.status);
  const canPause = campaign && ['running', 'queued'].includes(campaign.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-theme-lg" onMouseDown={(e) => e.stopPropagation()}>
        {isLoading || !campaign ? (
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
                <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>

              {/* lifecycle actions */}
              <div className="mt-3 flex flex-wrap gap-2">
                {canStart ? (
                  <button type="button" onClick={() => start.mutate({ id: campaignId })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600">
                    <Play className="h-3.5 w-3.5" /> {campaign.status === 'paused' ? 'Resume' : 'Start'}
                  </button>
                ) : null}
                {canPause ? (
                  <button type="button" onClick={() => pause.mutate(campaignId)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </button>
                ) : null}
                {campaign.status === 'paused' ? (
                  <button type="button" onClick={() => resume.mutate(campaignId)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    <Play className="h-3.5 w-3.5" /> Resume
                  </button>
                ) : null}
                {['completed', 'running', 'paused'].includes(campaign.status) ? (
                  <button type="button" onClick={() => retry.mutate(campaignId)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    <RotateCcw className="h-3.5 w-3.5" /> Retry failed
                  </button>
                ) : null}
                {!['completed', 'cancelled'].includes(campaign.status) ? (
                  <button type="button" onClick={() => setConfirmCancel(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10">
                    <Square className="h-3.5 w-3.5" /> Cancel
                  </button>
                ) : null}
                <button type="button" onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                  <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
            </div>

            {/* tabs */}
            <div className="flex gap-1 border-b border-border px-4">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={ListChecks} label="Overview" />
              <TabButton active={tab === 'recipients'} onClick={() => setTab('recipients')} icon={Phone} label="Recipients" />
              <TabButton active={tab === 'simulate'} onClick={() => setTab('simulate')} icon={FlaskConical} label="Simulate" />
              <TabButton active={tab === 'webtest'} onClick={() => setTab('webtest')} icon={Mic} label="Live test" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'overview' && s ? (
                <div className="space-y-4">
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
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                    <p><strong className="text-foreground">{campaign.questionnaire.questions.length}</strong> questions · <strong className="text-foreground">{campaign.statusRules.length}</strong> rules · agent <strong className="text-foreground">{campaign.agentConfig.agentName}</strong> ({campaign.agentConfig.voice})</p>
                    <p className="mt-1">Total talk time: {Math.round((s.totalCallSeconds || 0) / 60)}m · Est. cost: ${Number(s.actualCost || 0).toFixed(2)}</p>
                  </div>
                </div>
              ) : null}

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
        onConfirm={() => { cancel.mutate(campaignId); setConfirmCancel(false); }}
      />
    </div>
  );
}

function LiveCallsPanel({ campaignId, active }: { campaignId: string; active: boolean }) {
  const { data } = useActiveCalls(campaignId, active);
  const calls = data ?? [];
  if (!calls.length) return null;
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
        {calls.length} call{calls.length > 1 ? 's' : ''} in progress
      </div>
      <ul className="space-y-2">
        {calls.map((c) => (
          <li key={c.callId} className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-2.5 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{c.leadName}{c.isTest ? <span className="ml-1 text-[10px] text-amber-600">TEST</span> : null}</div>
              <div className="truncate text-xs text-muted-foreground">{c.currentQuestion || c.phase} · {c.answered}/{c.total} answered</div>
            </div>
            <div className="shrink-0 text-right">
              <StatusPill status={c.state} />
              <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{Math.floor(c.elapsedSeconds / 60)}:{String(c.elapsedSeconds % 60).padStart(2, '0')}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecipientsTab({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useRecipients(campaignId);
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const rows = (data?.data ?? []) as Array<Record<string, any>>;
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
                <td className="py-2">{r.qualification ? <StatusPill status={r.qualification} /> : <span className="text-xs text-muted-foreground">{r.finalDisposition || '—'}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {reviewCallId ? <CallReviewDrawer callId={reviewCallId} onClose={() => setReviewCallId(null)} /> : null}
    </>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${active ? 'border-brand-500 text-brand-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
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
