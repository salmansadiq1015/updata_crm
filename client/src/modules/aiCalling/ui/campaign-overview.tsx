'use client';
import { useState, type ComponentType, type ReactElement } from 'react';
import { Activity, AlertTriangle, Clock3, Loader2, Pause, Phone, PhoneOutgoing, RadioTower, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { EmptyState as EmptyStateRaw } from '@/shared/components/empty-state';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { useCampaignMutations, useDeleteCampaigns } from '../hooks/use-ai-calling';
import { usePermissions } from '@/shared/hooks/use-permissions';
import type { Campaign, TelephonyHealth } from '../types/ai-calling-types';
import { StatusPill } from './status-pill';
const EmptyState = EmptyStateRaw as (props: {
  icon?: unknown; title?: string; description?: string;
}) => ReactElement;

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

function fmtDuration(seconds: number): string {
  if (!seconds) return '0m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Lifecycle actions available for a campaign in its current status. */
const canStart = (s: string) => ['draft', 'scheduled', 'paused'].includes(s);
const canPause = (s: string) => ['running', 'queued'].includes(s);
const canCancel = (s: string) => ['draft', 'scheduled', 'paused', 'running', 'queued'].includes(s);
const canDelete = (s: string) => !['running', 'queued', 'scheduled'].includes(s);

export function CampaignOverview({
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
  const { start, pause, resume, cancel } = useCampaignMutations();
  const { isAdmin, hasPermission } = usePermissions();
  const canManage = isAdmin || ['ai-calling:write', 'ai-calling:admin', 'crm:write', 'crm:admin'].some(hasPermission);
  const del = useDeleteCampaigns();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { kind: 'delete' | 'cancel'; ids: string[]; label: string }>(null);
  const lifecycleBusy = start.isPending || pause.isPending || resume.isPending || cancel.isPending;

  const ids = campaigns.map((c) => c._id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids));
  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'delete') del.mutate(confirm.ids, { onSettled: () => { setSelected(new Set()); setConfirm(null); } });
    else { confirm.ids.forEach((id) => cancel.mutate(id)); setConfirm(null); }
  };
  const selectedDeletable = [...selected].filter((id) => { const c = campaigns.find((x) => x._id === id); return c && canDelete(c.status); });
  return (
    <section aria-labelledby="campaign-overview-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_42px_rgba(2,6,23,.18)]">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/10 text-primary"><Activity className="h-4 w-4" /></span>
          <div>
            <h2 id="campaign-overview-title" className="text-sm font-semibold">Campaign overview</h2>
            <p className="text-[11px] text-muted-foreground">Open a campaign to control it, inspect recipients, or monitor live calls</p>
          </div>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{total} total</span>
      </div>
      {selected.size > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-blue-400/[.06] px-4 py-2 text-xs">
          <span className="font-semibold text-foreground">{selected.size} selected</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted">Clear</button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'delete', ids: selectedDeletable, label: `${selectedDeletable.length} campaign${selectedDeletable.length === 1 ? '' : 's'}` })}
              disabled={!canManage || !selectedDeletable.length || del.isPending}
              title={selectedDeletable.length < selected.size ? 'Running, queued or scheduled campaigns must be paused or cancelled first' : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete{selectedDeletable.length < selected.size ? ` (${selectedDeletable.length})` : ''}
            </button>
          </div>
        </div>
      ) : null}
      {isLoading ? (
        <div className="grid gap-2 p-4" role="status" aria-label="Loading campaigns">
          {[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-white/4" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Campaigns could not be loaded.
          <button type="button" onClick={onRetry} className="font-semibold text-primary hover:text-blue-200">Try again</button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-8 text-muted-foreground">
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
              <tr className="border-b border-border bg-white/[.018] text-start text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">
                <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Select all campaigns" className="h-4 w-4 accent-blue-500" checked={allSelected} onChange={toggleAll} /></th>
                <th className="px-4 py-2.5">Campaign</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Progress</th>
                <th className="px-4 py-2.5 text-end">Qualified</th>
                <th className="px-4 py-2.5 text-end">Callbacks</th>
                <th className="px-4 py-2.5 text-end">Review</th>
                <th className="px-4 py-2.5 text-end">Talk time</th>
                <th className="px-4 py-2.5 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const noWaitingLeads = canStart(campaign.status) && campaign.summary.queued === 0;
                const completed = campaign.summary.completed || 0;
                const totalLeads = campaign.summary.total || 0;
                const progress = totalLeads ? Math.min(100, Math.round((completed / totalLeads) * 100)) : 0;
                return (
                  <tr
                    key={campaign._id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onSelect(campaign._id)}
                    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(campaign._id); } }}
                    className={`cursor-pointer border-b border-border text-muted-foreground outline-none transition last:border-0 hover:bg-blue-400/[.045] focus-visible:bg-blue-400/[.065] ${selected.has(campaign._id) ? 'bg-blue-400/[.06]' : ''}`}
                  >
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${campaign.name}`} className="h-4 w-4 accent-blue-500" checked={selected.has(campaign._id)} onChange={() => toggle(campaign._id)} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <button type="button" onClick={event => { event.stopPropagation(); onSelect(campaign._id); }} className="min-w-0 truncate text-start font-semibold hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">{campaign.name}</button>
                        {campaign.isTest ? <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">TEST</span> : null}
                        {campaign.transport === 'paired_phone' ? <span title="Paired phone transport" className="rounded bg-blue-400/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">SIM</span> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{campaign.questionnaire?.questions?.length ?? 0} questions · {campaign.agentConfig.agentName}{!campaign.agentId ? ' · Legacy campaign' : ''}</div>
                      {canStart(campaign.status) || canPause(campaign.status) ? <button type="button"
                        disabled={!canManage || lifecycleBusy || noWaitingLeads}
                        title={noWaitingLeads ? 'No eligible leads are waiting. Open the campaign to check Recipients.' : undefined}
                        onClick={event => { event.stopPropagation(); if (canPause(campaign.status)) pause.mutate(campaign._id); else if (campaign.status === 'paused') resume.mutate(campaign._id); else start.mutate({ id: campaign._id, scheduledAt: null }); }}
                        className={`mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${canPause(campaign.status) ? 'border border-amber-400/25 text-amber-300 hover:bg-amber-400/10' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
                        {lifecycleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : canPause(campaign.status) ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <PhoneOutgoing className="h-3.5 w-3.5" aria-hidden="true" />}
                        {canPause(campaign.status) ? campaign.channel === 'web_link' ? 'Pause campaign' : 'Pause calling' : campaign.channel === 'web_link' ? 'Start campaign' : 'Start calling'}
                      </button> : null}
                      {noWaitingLeads ? <p className="mt-1 text-[11px] text-muted-foreground">No eligible leads waiting · check Recipients</p> : null}
                    </td>
                    <td className="px-4 py-3"><StatusPill status={campaign.status === 'running' ? (campaign.summary.inProgress > 0 ? 'calling' : campaign.waitReason ? 'waiting' : 'queued') : campaign.status} /></td>
                    <td className="min-w-48 px-4 py-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{completed}/{totalLeads}</span><span>{progress}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/6"><span className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${progress}%` }} /></div>
                    </td>
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-emerald-300">{campaign.summary.qualified}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-primary">{campaign.summary.callbacks}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-rose-300">{(campaign.summary.needsReview || 0) + (campaign.summary.needsReconcile || 0)}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{fmtDuration(campaign.summary.totalCallSeconds)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {canCancel(campaign.status) ? (
                          <RowAction label="Cancel" tone="slate" disabled={!canManage || lifecycleBusy} onClick={() => setConfirm({ kind: 'cancel', ids: [campaign._id], label: `“${campaign.name}”` })} icon={Square} />
                        ) : null}
                        <RowAction
                          label={canDelete(campaign.status) ? 'Delete' : 'Pause or cancel before deleting'}
                          tone="rose"
                          disabled={!canManage || !canDelete(campaign.status)}
                          onClick={() => setConfirm({ kind: 'delete', ids: [campaign._id], label: `“${campaign.name}”` })}
                          icon={Trash2}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirm?.kind === 'delete' ? `Delete ${confirm.label}?` : `Cancel ${confirm?.label}?`}
        description={confirm?.kind === 'delete'
          ? 'This permanently removes the campaign and all of its recipients and call history. This cannot be undone.'
          : 'This stops the campaign. Calls already connected finish politely; nothing new is dialled.'}
        confirmText={confirm?.kind === 'delete' ? 'Delete' : 'Cancel campaign'}
        cancelText="Keep"
        variant="destructive"
        isLoading={del.isPending || cancel.isPending}
        onConfirm={runConfirm}
      />
    </section>
  );
}

function RowAction({ label, icon: Icon, onClick, tone, busy, disabled }: {
  label: string; icon: ComponentType<{ className?: string }>; onClick: () => void;
  tone: 'emerald' | 'amber' | 'rose' | 'slate'; busy?: boolean; disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-300 hover:bg-emerald-400/10',
    amber: 'text-amber-300 hover:bg-amber-400/10',
    rose: 'text-rose-300 hover:bg-rose-400/10',
    slate: 'text-muted-foreground hover:bg-muted',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-35 ${tones[tone]}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}

export function TelephonyBanner({ telephony, failed }: { telephony?: TelephonyHealth; failed?: boolean }) {
  if (!telephony) {
    if (!failed) {
      return <div className="h-14 animate-pulse rounded-2xl border border-border bg-muted/40" aria-label="Checking calling readiness" role="status" />;
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
    <section aria-label="Calling readiness" className="grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-[1fr_auto]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${browserReady ? 'bg-blue-400/10 text-primary' : 'bg-amber-400/10 text-amber-300'}`}>
          {browserReady ? <RadioTower className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-sm font-semibold">{browserReady ? 'Browser agent route configured' : 'Voice infrastructure needs setup'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {browserReady
              ? `Browser tests can connect through LiveKit and the configured AI provider. ${sipReady ? 'Cloud SIP is configured for real phone calls.' : 'Cloud SIP is not ready; use a verified paired phone for SIM campaigns.'}`
              : 'Campaign design and text simulation are available, but a real browser or phone voice session cannot start.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 border-t border-border md:border-l md:border-t-0">
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
      <span className={`mt-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold ${ok ? 'text-emerald-300' : 'text-muted-foreground'}`}>
        {ok ? <ShieldCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{value}
      </span>
    </div>
  );
}
