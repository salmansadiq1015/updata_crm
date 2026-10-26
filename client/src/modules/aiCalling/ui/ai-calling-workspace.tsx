'use client';

import { useState, type ComponentType, type ReactElement } from 'react';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clock3, Headphones, Mic,
  Phone, PhoneCall, PhoneMissed, PhoneOutgoing, Plus, RadioTower,
  ShieldCheck, TrendingUp, Users,
} from 'lucide-react';
import { EmptyState as EmptyStateRaw } from '@/shared/components/empty-state';
import { useAnalytics, useCampaigns, useTelephonyHealth } from '../hooks/use-ai-calling';
import type { Campaign, TelephonyHealth } from '../types/ai-calling-types';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { AnalyticsPanel } from './analytics-panel';
import { CampaignWizard } from './campaign-wizard';
import { CampaignDetailDrawer } from './campaign-detail-drawer';
import { LinkKillSwitch } from './link-kill-switch';
import { VoiceKillSwitch } from './voice-kill-switch';
import { PairedPhonesPanel } from './paired-phones-panel';
import { StatusPill } from './status-pill';
import { AgentTestLauncher, AgentTestStudio } from './agent-test-studio';
import { CallHistoryPanel } from './call-history-panel';

const EmptyState = EmptyStateRaw as (props: {
  icon?: unknown; title?: string; description?: string;
}) => ReactElement;

function fmtDuration(seconds: number): string {
  if (!seconds) return '0m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AiCallingWorkspace() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [testStudioOpen, setTestStudioOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: campaignsPage, isLoading, isError, refetch } = useCampaigns();
  const { data: telephony, isError: telephonyError } = useTelephonyHealth();
  const { data: analytics } = useAnalytics();
  useAiCallingRealtime();

  const campaigns = campaignsPage?.data ?? [];
  const active = campaigns.filter((campaign) => ['running', 'queued', 'scheduled'].includes(campaign.status)).length;
  const aggregate = campaigns.reduce(
    (result, campaign) => {
      result.eligible += campaign.summary.eligible || 0;
      result.inProgress += campaign.summary.inProgress || 0;
      result.completed += campaign.summary.completed || 0;
      result.qualified += campaign.summary.qualified || 0;
      result.callbacks += campaign.summary.callbacks || 0;
      result.needsReview += (campaign.summary.needsReview || 0) + (campaign.summary.needsReconcile || 0);
      result.failed += campaign.summary.failed || 0;
      return result;
    },
    { eligible: 0, inProgress: 0, completed: 0, qualified: 0, callbacks: 0, needsReview: 0, failed: 0 },
  );

  return (
    <div className="dark flex h-full flex-col gap-5 overflow-y-auto bg-[#070b14] p-4 text-slate-100 sm:p-6 [&>*]:shrink-0">
      <header className="relative overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(125deg,#0d1528_0%,#0b1223_55%,#10102a_100%)] px-4 py-5 shadow-[0_24px_64px_rgba(2,6,23,.28)] sm:px-5">
        <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-500/10">
              <Bot className="h-5 w-5 text-blue-400" />
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0d1528] bg-blue-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">AI Voice Calling</h1>
                <span className="rounded-md border border-violet-400/15 bg-violet-400/8 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-violet-300">Control room</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">Build safe campaigns, test the real agent, monitor live calls, and review outcomes from one workspace.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTestStudioOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-400/25 bg-blue-400/8 px-4 text-sm font-semibold text-blue-200 transition hover:bg-blue-400/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <Mic className="h-4 w-4" /> Test agent
            </button>
            <button
              type="button"
              onClick={() => { setEditingCampaign(null); setWizardOpen(true); }}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/25 transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            >
              <Plus className="h-4 w-4" /> New campaign
            </button>
          </div>
        </div>
      </header>

      <TelephonyBanner telephony={telephony} failed={telephonyError} />

      <AgentTestLauncher
        campaigns={campaigns}
        livekitReady={Boolean(telephony?.livekitReady || telephony?.configured)}
        onOpen={() => setTestStudioOpen(true)}
      />

      <section aria-label="Calling overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        <ControlMetric label="Active campaigns" value={isLoading ? '—' : active} icon={PhoneCall} tone="violet" />
        <ControlMetric label="Eligible leads" value={isLoading ? '—' : aggregate.eligible} icon={Users} tone="blue" />
        <ControlMetric label="In progress" value={isLoading ? '—' : aggregate.inProgress} icon={PhoneOutgoing} tone="amber" live={aggregate.inProgress > 0} />
        <ControlMetric label="Completed" value={isLoading ? '—' : aggregate.completed} icon={CheckCircle2} tone="emerald" />
        <ControlMetric label="Answer rate" value={analytics?.answerRate == null ? '—' : `${Math.round(analytics.answerRate * 100)}%`} icon={Headphones} tone="cyan" />
        <ControlMetric label="Qualified" value={isLoading ? '—' : aggregate.qualified} icon={TrendingUp} tone="emerald" />
        <ControlMetric label="Needs review" value={isLoading ? '—' : aggregate.needsReview} icon={AlertTriangle} tone="rose" />
        <ControlMetric label="Failed" value={isLoading ? '—' : aggregate.failed} icon={PhoneMissed} tone="rose" />
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <VoiceKillSwitch />
        <LinkKillSwitch />
      </div>

      <CampaignOverview
        campaigns={campaigns}
        total={campaignsPage?.pagination?.total ?? campaigns.length}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onSelect={setSelectedId}
      />

      <CallHistoryPanel />

      <PairedPhonesPanel />

      <AnalyticsPanel />

      {wizardOpen ? (
        <CampaignWizard
          campaign={editingCampaign ?? undefined}
          onClose={() => { setWizardOpen(false); setEditingCampaign(null); }}
          onCreated={(id) => { setWizardOpen(false); setEditingCampaign(null); setSelectedId(id); }}
        />
      ) : null}
      {selectedId ? (
        <CampaignDetailDrawer
          campaignId={selectedId}
          onClose={() => setSelectedId(null)}
          onEdit={(campaign) => { setEditingCampaign(campaign); setWizardOpen(true); }}
        />
      ) : null}
      {testStudioOpen ? (
        <AgentTestStudio
          campaigns={campaigns}
          telephony={telephony}
          onClose={() => setTestStudioOpen(false)}
          onCreateCampaign={() => { setEditingCampaign(null); setWizardOpen(true); }}
        />
      ) : null}
    </div>
  );
}

function CampaignOverview({
  campaigns,
  total,
  isLoading,
  isError,
  onRetry,
  onSelect,
}: {
  campaigns: Campaign[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-labelledby="campaign-overview-title" className="overflow-hidden rounded-2xl border border-white/8 bg-[#0b1223] shadow-[0_16px_42px_rgba(2,6,23,.18)]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Activity className="h-4 w-4" /></span>
          <div>
            <h2 id="campaign-overview-title" className="text-sm font-semibold">Campaign overview</h2>
            <p className="text-[11px] text-slate-500">Open a campaign to control it, inspect recipients, or monitor live calls</p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500">{total} total</span>
      </div>
      {isLoading ? (
        <div className="grid gap-2 p-4" role="status" aria-label="Loading campaigns">
          {[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-white/4" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-400">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Campaigns could not be loaded.
          <button type="button" onClick={onRetry} className="font-semibold text-blue-300 hover:text-blue-200">Try again</button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-8 text-slate-300">
          <EmptyState
            icon={Phone}
            title="No calling campaigns yet"
            description="Create a campaign, choose eligible leads, configure the agent, and verify the flow before starting calls."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-white/7 bg-white/[.018] text-left text-[10px] font-bold uppercase tracking-[.13em] text-slate-500">
                <th className="px-4 py-2.5">Campaign</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Progress</th>
                <th className="px-4 py-2.5 text-right">Qualified</th>
                <th className="px-4 py-2.5 text-right">Callbacks</th>
                <th className="px-4 py-2.5 text-right">Review</th>
                <th className="px-4 py-2.5 text-right">Talk time</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const completed = campaign.summary.completed || 0;
                const totalLeads = campaign.summary.total || 0;
                const progress = totalLeads ? Math.min(100, Math.round((completed / totalLeads) * 100)) : 0;
                return (
                  <tr
                    key={campaign._id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onSelect(campaign._id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(campaign._id); } }}
                    className="cursor-pointer border-b border-white/6 text-slate-300 outline-none transition last:border-0 hover:bg-blue-400/[.045] focus-visible:bg-blue-400/[.065]"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 font-semibold text-slate-100">
                        {campaign.name}
                        {campaign.isTest ? <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">TEST</span> : null}
                        {campaign.transport === 'paired_phone' ? <span title="Paired phone transport" className="rounded bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">SIM</span> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{campaign.questionnaire?.questions?.length ?? 0} questions · {campaign.agentConfig.agentName}</div>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={campaign.status} /></td>
                    <td className="min-w-48 px-4 py-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-500"><span>{completed}/{totalLeads}</span><span>{progress}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6"><span className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${progress}%` }} /></div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-300">{campaign.summary.qualified}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-300">{campaign.summary.callbacks}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300">{(campaign.summary.needsReview || 0) + (campaign.summary.needsReconcile || 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtDuration(campaign.summary.totalCallSeconds)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const TONE: Record<string, { icon: string; value: string; surface: string }> = {
  blue: { icon: 'text-blue-300', value: 'text-blue-200', surface: 'bg-blue-400/10' },
  cyan: { icon: 'text-cyan-300', value: 'text-cyan-200', surface: 'bg-cyan-400/10' },
  violet: { icon: 'text-violet-300', value: 'text-violet-200', surface: 'bg-violet-400/10' },
  emerald: { icon: 'text-emerald-300', value: 'text-emerald-200', surface: 'bg-emerald-400/10' },
  amber: { icon: 'text-amber-300', value: 'text-amber-200', surface: 'bg-amber-400/10' },
  rose: { icon: 'text-rose-300', value: 'text-rose-200', surface: 'bg-rose-400/10' },
};

function ControlMetric({
  label,
  value,
  icon: Icon,
  tone,
  live = false,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof TONE;
  live?: boolean;
}) {
  const color = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#0b1223] p-3.5 shadow-[0_12px_32px_rgba(2,6,23,.14)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p>
          <p className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${color.value}`}>{value}</p>
        </div>
        <span className={`relative flex h-9 w-9 items-center justify-center rounded-xl ${color.surface}`}>
          <Icon className={`h-4 w-4 ${color.icon}`} />
          {live ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-[#0b1223]" /> : null}
        </span>
      </div>
    </div>
  );
}

function TelephonyBanner({ telephony, failed }: { telephony?: TelephonyHealth; failed?: boolean }) {
  if (!telephony) {
    if (!failed) {
      return <div className="h-14 animate-pulse rounded-2xl border border-white/6 bg-white/3" aria-label="Checking calling readiness" role="status" />;
    }
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/7 px-4 py-3 text-sm text-amber-100">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div><p className="font-semibold">Readiness could not be verified</p><p className="mt-0.5 text-xs text-amber-100/70">Do not assume calls can be placed until the health endpoint responds.</p></div>
      </div>
    );
  }

  const warnings = telephony.operations?.warnings ?? [];
  const browserReady = Boolean(telephony.livekitReady || telephony.configured);
  const sipReady = Boolean(telephony.configured && telephony.eligible);
  return (
    <section aria-label="Calling readiness" className="grid overflow-hidden rounded-2xl border border-white/8 bg-[#0b1223] md:grid-cols-[1fr_auto]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${browserReady ? 'bg-blue-400/10 text-blue-300' : 'bg-amber-400/10 text-amber-300'}`}>
          {browserReady ? <RadioTower className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-sm font-semibold">{browserReady ? 'Browser agent route configured' : 'Voice infrastructure needs setup'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            {browserReady
              ? `Browser tests can connect through LiveKit and OpenAI. ${sipReady ? 'Cloud SIP is configured for real phone calls.' : 'Cloud SIP is not ready; use a verified paired phone for SIM campaigns.'}`
              : 'Campaign design and text simulation are available, but a real browser or phone voice session cannot start.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-white/8 md:border-l md:border-t-0">
        <ReadinessFact label="Browser" value={browserReady ? 'Configured' : 'Offline'} ok={browserReady} />
        <ReadinessFact label="Cloud SIP" value={sipReady ? 'Eligible' : 'Not ready'} ok={sipReady} />
        <ReadinessFact label="Operations" value={warnings.length ? `${warnings.length} alert${warnings.length === 1 ? '' : 's'}` : 'Clear'} ok={!warnings.length} />
      </div>
      {warnings.length ? (
        <div className="col-span-full flex items-start gap-2 border-t border-rose-400/15 bg-rose-400/6 px-4 py-2.5 text-xs text-rose-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
          <span><strong className="font-semibold">Action required:</strong> {warnings.join(' · ')}</span>
        </div>
      ) : null}
    </section>
  );
}

function ReadinessFact({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex min-w-24 flex-col justify-center px-3 py-2.5 text-center">
      <span className="text-[9px] font-bold uppercase tracking-[.13em] text-slate-600">{label}</span>
      <span className={`mt-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold ${ok ? 'text-emerald-300' : 'text-slate-400'}`}>
        {ok ? <ShieldCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{value}
      </span>
    </div>
  );
}
