'use client';

import { useEffect, useState } from 'react';
import { Bot, ChevronRight, MessageSquareText, RefreshCw, UserRound } from 'lucide-react';
import { useActiveCalls } from '../hooks/use-ai-calling';
import { CallAudioMonitor } from './call-audio-monitor';
import { CallTranscript } from './call-transcript';
import { PairedCallHealth } from './paired-call-health';
import { StatusPill } from './status-pill';
import { UpdataVoiceOrb, type UpdataVoiceOrbState } from './updata-voice-orb';

export function LiveCallsPanel({ campaignId, active, onPreview }: { campaignId: string; active: boolean; onPreview: (id: string) => void }) {
  const query = useActiveCalls(campaignId, active);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const calls = query.data || [];
  if (!active && !calls.length) return null;
  if (query.isLoading) return <div className="skeleton-shimmer h-48 rounded-xl bg-muted" aria-label="Loading live calls" />;
  if (query.isError && !query.data) return <div className="rounded-xl border border-border p-4 text-xs"><p>Live calls could not be loaded.</p><button type="button" className="mt-2 text-primary underline" onClick={() => void query.refetch()}>Try again</button></div>;
  if (!calls.length) return <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground"><MessageSquareText className="mx-auto mb-2 size-6 opacity-50" /><p>No live call right now.</p><p className="mt-1 text-xs">The conversation appears here when the next call connects.</p></div>;

  return <section aria-label="Live call conversations" className="min-w-0 space-y-3">
    <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className="size-2 animate-pulse rounded-full bg-emerald-500" />Live conversations <span className="text-xs font-normal text-muted-foreground">({calls.length})</span></h3><button type="button" aria-label="Refresh live conversations" disabled={query.isFetching} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => void query.refetch()}><RefreshCw className={`size-3.5 ${query.isFetching ? 'animate-spin' : ''}`} /></button></div>
    {query.isError && <p role="alert" className="text-xs text-amber-600">Showing the last received update. Reconnecting…</p>}
    {calls.map(call => {
      const activity = call.agentActivity;
      const fresh = activity?.at && now - Date.parse(activity.at) < 10_000;
      const orbState: UpdataVoiceOrbState = call.gateway?.audioLost ? 'error' : ['queued', 'initiating', 'ringing'].includes(call.state) ? 'connecting'
        : fresh && activity.agentState === 'speaking' ? 'speaking' : fresh && activity.agentState === 'thinking' ? 'processing' : fresh && activity.agentState === 'listening' ? 'listening' : 'idle';
      const speaker = fresh && activity.speaker === 'assistant' ? `${call.agentName || 'Agent'} is speaking` : fresh && activity.speaker === 'customer' ? 'Lead is speaking' : fresh && activity.agentState === 'thinking' ? 'Preparing a response' : call.state === 'ringing' ? 'Phone is ringing' : 'Live conversation';
      return <article key={call.recordId} className="min-w-0 space-y-4 rounded-xl border border-primary/20 bg-background/60 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><UpdataVoiceOrb state={orbState} size="compact" /><div className="min-w-0"><button type="button" className="block max-w-full truncate text-start text-sm font-semibold hover:text-primary" onClick={() => onPreview(call.recordId)}>{call.leadName}</button><p className="mt-0.5 text-xs text-muted-foreground">{speaker}</p></div></div><div className="shrink-0 space-y-1 text-end"><StatusPill status={call.state} /><p className="text-xs tabular-nums text-muted-foreground">{Math.floor(call.elapsedSeconds / 60)}:{String(call.elapsedSeconds % 60).padStart(2, '0')}</p></div></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Bot className="size-3" />{call.agentName || 'AI agent'}</span><span className="inline-flex items-center gap-1"><UserRound className="size-3" />{call.leadNumber || 'Lead'}</span>{call.isTest && <span className="text-amber-500">Test call</span>}</div>
        <div className="space-y-1.5"><div className="flex items-start justify-between gap-3 text-xs"><p className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{call.currentQuestion || 'Connecting to the lead'}</p><span className="shrink-0 tabular-nums text-muted-foreground">{call.answered}/{call.total} answered</span></div><div role="progressbar" aria-label="Call questions answered" aria-valuenow={call.answered} aria-valuemin={0} aria-valuemax={call.total || 1} className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${call.total ? Math.min(100, call.answered / call.total * 100) : 0}%` }} /></div></div>
        <div className="space-y-3 border-t border-border/60 pt-3"><p className="flex items-center gap-1.5 text-xs font-medium"><MessageSquareText className="size-3.5 text-primary" />Conversation transcript</p><CallTranscript turns={call.transcriptPreview || []} live agentName={call.agentName} leadName={call.leadName} compact /><button type="button" className="flex w-full items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/10" onClick={() => onPreview(call.recordId)}>Open transcript &amp; full details<ChevronRight className="size-3.5 shrink-0" /></button></div>
        <CallAudioMonitor callId={call.recordId} live={['initiating', 'ringing', 'in_progress'].includes(call.state) && !call.gateway?.audioLost && !call.gateway?.takenOver} />
        {call.transport === 'paired_phone' && <PairedCallHealth call={call} compact />}
      </article>;
    })}
  </section>;
}
