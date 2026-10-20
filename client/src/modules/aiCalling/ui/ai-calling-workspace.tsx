'use client';

import { useState, type ReactElement } from 'react';
import {
  PhoneCall, Phone, PhoneOutgoing, PhoneMissed, CheckCircle2, Users, AlertTriangle,
  Plus, Clock, TrendingUp, PhoneForwarded, Bot, Loader2,
} from 'lucide-react';
import { PremiumStatCard as PremiumStatCardRaw } from '@/shared/components/premium-stat-card';
import { EmptyState as EmptyStateRaw } from '@/shared/components/empty-state';
import { useCampaigns, useTelephonyHealth } from '../hooks/use-ai-calling';
import type { TelephonyHealth } from '../types/ai-calling-types';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { AnalyticsPanel } from './analytics-panel';

// The shared cards are untyped .jsx; loosen their prop types for this .tsx module.
const PremiumStatCard = PremiumStatCardRaw as (props: {
  label: string; value: number | string; icon?: unknown; accent?: string; suffix?: string;
}) => ReactElement;
const EmptyState = EmptyStateRaw as (props: {
  icon?: unknown; title?: string; description?: string;
}) => ReactElement;
import type { Campaign } from '../types/ai-calling-types';
import { CampaignWizard } from './campaign-wizard';
import { CampaignDetailDrawer } from './campaign-detail-drawer';
import { StatusPill } from './status-pill';

function fmtDuration(seconds: number): string {
  if (!seconds) return '0m';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function AiCallingWorkspace() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: campaignsPage, isLoading, isError, refetch } = useCampaigns();
  const { data: telephony, isError: telephonyError } = useTelephonyHealth();
  useAiCallingRealtime(); // live dashboard updates via socket

  const campaigns = campaignsPage?.data ?? [];
  const active = campaigns.filter((c) => ['running', 'queued', 'scheduled'].includes(c.status)).length;

  // Aggregate live summary across campaigns for the top stat row.
  const agg = campaigns.reduce(
    (acc, c) => {
      acc.eligible += c.summary.eligible || 0;
      acc.inProgress += c.summary.inProgress || 0;
      acc.completed += c.summary.completed || 0;
      acc.qualified += c.summary.qualified || 0;
      acc.callbacks += c.summary.callbacks || 0;
      acc.needsReview += c.summary.needsReview || 0;
      acc.noAnswer += c.summary.noAnswer || 0;
      return acc;
    },
    { eligible: 0, inProgress: 0, completed: 0, qualified: 0, callbacks: 0, needsReview: 0, noAnswer: 0 },
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20">
            <Bot className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Voice Calling</h1>
            <p className="text-sm text-muted-foreground">Configure questions, call leads with an AI agent, and auto-update your pipeline.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-theme-sm transition hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      {/* Telephony status — honest about whether real calls are possible */}
      <TelephonyBanner telephony={telephony} failed={telephonyError} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <PremiumStatCard label="Active campaigns" value={active} icon={PhoneCall} accent="violet" />
        <PremiumStatCard label="Eligible leads" value={agg.eligible} icon={Users} accent="blue" />
        <PremiumStatCard label="In progress" value={agg.inProgress} icon={PhoneOutgoing} accent="amber" />
        <PremiumStatCard label="Calls completed" value={agg.completed} icon={CheckCircle2} accent="emerald" />
        <PremiumStatCard label="Qualified" value={agg.qualified} icon={TrendingUp} accent="emerald" />
        <PremiumStatCard label="Callbacks" value={agg.callbacks} icon={PhoneForwarded} accent="blue" />
        <PremiumStatCard label="Needs review" value={agg.needsReview} icon={AlertTriangle} accent="rose" />
      </div>

      {/* Analytics: rates, outcome breakdown, daily trend, CSV export */}
      <AnalyticsPanel />

      {/* Campaigns table */}
      <div className="min-h-0 flex-1 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Campaigns</h2>
          <span className="text-xs text-muted-foreground">{campaignsPage?.pagination?.total ?? campaigns.length} total</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : isError && !campaignsPage ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Campaigns could not be loaded.
            <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Phone}
              title="No calling campaigns yet"
              description="Create a campaign, configure the questions your AI agent should ask, and start calling leads."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Campaign</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Leads</th>
                  <th className="px-4 py-2 font-medium text-right">Done</th>
                  <th className="px-4 py-2 font-medium text-right">Qualified</th>
                  <th className="px-4 py-2 font-medium text-right">Review</th>
                  <th className="px-4 py-2 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c: Campaign) => (
                  <tr
                    key={c._id}
                    onClick={() => setSelectedId(c._id)}
                    className="cursor-pointer border-b border-border/60 transition hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        {c.name}
                        {c.isTest ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">TEST</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.questionnaire?.questions?.length ?? 0} questions</div>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.summary.eligible}/{c.summary.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.summary.completed}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{c.summary.qualified}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-600">{c.summary.needsReview}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtDuration(c.summary.totalCallSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {wizardOpen ? <CampaignWizard onClose={() => setWizardOpen(false)} onCreated={(id) => { setWizardOpen(false); setSelectedId(id); }} /> : null}
      {selectedId ? <CampaignDetailDrawer campaignId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function TelephonyBanner({ telephony, failed }: { telephony?: TelephonyHealth; failed?: boolean }) {
  if (!telephony) {
    if (!failed) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>Telephony status could not be checked. Real calls may not be possible until it can be verified.</span>
      </div>
    );
  }
  const warnings = telephony.operations?.warnings ?? [];
  const ops = warnings.length ? (
    <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-700 dark:text-rose-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">Calling pipeline needs attention</p>
        <ul className="mt-1 list-disc pl-4 text-xs">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      </div>
    </div>
  ) : null;
  if (telephony.configured) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Telephony is configured (LiveKit + SIP trunk). Real outbound calls are possible once a SIP test call has been verified end to end.</span>
        </div>
        {ops}
      </div>
    );
  }
  if (telephony.livekitReady) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-400">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          LiveKit + OpenAI are configured — the browser <strong>Live test</strong> (talk to the agent with your mic) works now.
          To place real <strong>phone</strong> calls, add a LiveKit SIP outbound trunk (<code>LIVEKIT_SIP_OUTBOUND_TRUNK_ID</code>).
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        Telephony is not configured, so no real calls will be placed. You can still build campaigns and test the
        conversation in the browser <strong>Simulate</strong> console. Configure LiveKit + OpenAI Realtime to enable voice.
      </span>
    </div>
  );
}
