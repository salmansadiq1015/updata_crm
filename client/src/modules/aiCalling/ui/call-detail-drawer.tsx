'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, Tabs } from 'radix-ui';
import { Bot, ClipboardList, Clock3, ExternalLink, Lightbulb, Loader2, MessageSquareText, PhoneCall, RefreshCw, StickyNote, X } from 'lucide-react';
import { useCall } from '../hooks/use-ai-calling';
import { StatusPill } from './status-pill';
import { CallAudioMonitor } from './call-audio-monitor';
import { TranscriptWithIntelligence } from './call-intelligence-panel';
import { CallBehaviorTimeline } from './call-behavior-timeline';
import { useIntelT } from '../hooks/use-intel-t';
import { CallNotes } from './call-notes';
import { CallAnswerChecklist, ConversationInsightsPanel } from './conversation-insights';

const END_REASON: Record<string, string> = {
  remote_hangup: 'The phone reported that the call ended. This can be the other party hanging up or the cellular connection ending.',
  local_hangup: 'The voice agent or call service closed the conversation.',
  owner_hangup: 'The call was ended from the CRM.',
  max_duration: 'The configured maximum call duration was reached.',
  audio_lost: 'The phone audio connection was lost and did not recover.',
  audio_failed: 'The phone audio connection could not be established or decoded.',
  agent_left: 'The voice agent disconnected and did not return within the recovery window.',
  not_answered: 'The phone call was not answered.',
};

export function CallDetailDrawer({ callId, onClose }: { callId: string; onClose: () => void }) {
  const t = useIntelT();
  const query = useCall(callId);
  const call = query.data;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const live = Boolean(call && !call.endedAt && ['queued', 'initiating', 'ringing', 'in_progress', 'processing_results'].includes(call.state));
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  const lead = typeof call?.leadId === 'object' ? call.leadId : null;
  const campaign = typeof call?.campaignId === 'object' ? call.campaignId : null;
  const agentName = call?.callContext?.agentName || 'AI agent';
  const start = call?.answeredAt || call?.initiatedAt || call?.createdAt;
  const elapsed = live && start ? Math.max(0, Math.floor((now - Date.parse(start)) / 1000)) : Math.round(call?.durationSeconds || 0);
  const activity = call?.agentActivity;
  const activityFresh = activity?.at && now - Date.parse(activity.at) < 10_000;
  const speaker = !live ? 'Call ended' : activityFresh && activity.speaker === 'assistant' ? `${agentName} is speaking` : activityFresh && activity.speaker === 'customer' ? 'Lead is speaking' : activityFresh && activity.agentState === 'thinking' ? 'Agent is preparing a response' : call?.state === 'ringing' ? 'Phone is ringing' : 'Conversation updates live';
  const endReason = call?.gateway?.endReason;
  const endDetail = endReason ? END_REASON[endReason] || `Call ended: ${endReason.replaceAll('_', ' ')}.` : null;

  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-60 bg-black/50 backdrop-blur-sm" onMouseDown={event => event.stopPropagation()} />
    <Dialog.Content aria-label="Call conversation and details" className="fixed inset-y-0 end-0 z-60 flex h-dvh min-h-0 w-full max-w-3xl flex-col overflow-hidden border-s border-border bg-card text-foreground shadow-2xl outline-none" onMouseDown={event => event.stopPropagation()}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><PhoneCall className="size-4 text-primary" aria-hidden="true" /><Dialog.Title className="text-base font-semibold">{lead?.name || 'Call conversation'}</Dialog.Title>{call && <StatusPill status={call.state} />}{live && <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase text-emerald-500"><span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span>}</div><Dialog.Description className="mt-1 truncate text-xs text-muted-foreground">{campaign?.name || (call ? 'Call conversation and captured answers' : query.isError ? 'Call details unavailable. You can retry below.' : 'Loading call details…')}</Dialog.Description></div>
        <button type="button" aria-label="Close call details" className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose}><X className="size-4" /></button>
      </header>
      {query.isLoading ? <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />Loading conversation…</div> : !call ? <div role="alert" className="space-y-3 p-6 text-sm"><p>Call details could not be loaded.</p><button type="button" className="text-primary underline" onClick={() => void query.refetch()}>Try again</button></div> : <div ref={scrollContainerRef} data-call-conversation-scroll className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 pb-16 sm:px-6">
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/20 p-3 text-xs"><div><p className="text-muted-foreground">Agent</p><p className="mt-1 break-words font-medium">{agentName}</p></div><div><p className="text-muted-foreground">Duration</p><p className="mt-1 font-medium tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</p></div><div><p className="text-muted-foreground">Answers captured</p><p className="mt-1 font-medium">{call.callContext?.answered ?? call.answers.length} / {call.callContext?.total ?? '—'}</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="flex items-center gap-1.5 text-muted-foreground"><Bot className="size-3.5" />{speaker}</p><button type="button" disabled={query.isFetching} className="inline-flex items-center gap-1.5 text-primary disabled:opacity-50" onClick={() => void query.refetch()}><RefreshCw className={`size-3 ${query.isFetching ? 'animate-spin' : ''}`} />Refresh</button></div>
        {query.isError && <p role="alert" className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600">Connection interrupted. Showing the last received conversation. Retrying automatically while the call is active.</p>}
        {call.failureMessage && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-500">{call.failureMessage}</p>}
        {!live && endDetail && <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Why the call ended: </span>{endDetail}</p>}
        <CallAudioMonitor callId={callId} live={live && ['initiating', 'ringing', 'in_progress'].includes(call.state) && !call.gateway?.takenOverAt && !call.gateway?.audioLostAt} />
        <Tabs.Root defaultValue="conversation" className="space-y-4">
          <Tabs.List aria-label="Call detail sections" className="grid grid-cols-3 gap-1 sm:grid-cols-6 rounded-xl bg-muted/50 p-1">{([['conversation', 'Transcript', MessageSquareText], ['answers', 'Answers', ClipboardList], ['insights', 'Insights', Lightbulb], ['details', 'Details', Clock3], ['behavior', t('voicePolicy.callIntelligence', 'Call intelligence'), Lightbulb], ['notes', 'Notes', StickyNote]] as const).map(([value, label, Icon]) => <Tabs.Trigger key={String(value)} value={String(value)} className="flex min-w-0 items-center justify-center gap-1 rounded-lg px-0.5 py-2 text-[11px] sm:px-2 sm:text-xs text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"><Icon className="hidden size-3.5 sm:block" />{String(label)}</Tabs.Trigger>)}</Tabs.List>
          <Tabs.Content value="conversation" className="space-y-3 outline-none">{live && call.callContext?.currentQuestion && <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs"><p className="font-semibold text-primary">Current question</p><p className="mt-1 leading-relaxed">{call.callContext.currentQuestion}</p></div>}<TranscriptWithIntelligence call={call} live={live} agentName={agentName} leadName={lead?.name || 'Lead'} scrollContainerRef={scrollContainerRef} /><p className="text-[10px] text-muted-foreground">{call.transcript?.length || 0} spoken turns · AI-generated transcription may contain errors.</p></Tabs.Content>
          <Tabs.Content value="answers" className="outline-none"><CallAnswerChecklist call={call} /></Tabs.Content>
          <Tabs.Content value="insights" className="outline-none"><ConversationInsightsPanel call={call} /></Tabs.Content>
          <Tabs.Content value="details" className="space-y-4 outline-none"><dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{[['Lead', lead?.name || '—'], ['Phone', lead?.mobile || lead?.phone || '—'], ['Email', lead?.email || '—'], ['Lead status', lead?.status || '—'], ['Agent', agentName], ['Connection', call.provider === 'paired_phone' ? 'Paired phone · SIM' : call.provider || '—'], ['Attempt', String(call.attemptNumber)], ['Started', start ? new Date(start).toLocaleString() : '—'], ['Answered', call.answeredAt ? new Date(call.answeredAt).toLocaleString() : 'Not answered yet'], ['Ended', call.endedAt ? new Date(call.endedAt).toLocaleString() : 'In progress'], ['Call ID', call.internalCallId], ['Qualification', call.qualification || 'Not determined yet']].map(([label, value]) => <div key={label} className="rounded-lg border border-border p-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>{lead?._id && <a href={`/leads?detail=${encodeURIComponent(lead._id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary">Open lead details<ExternalLink className="size-3" /></a>}{call.callContext?.objective && <div className="rounded-xl border border-border p-3"><h3 className="text-xs font-semibold">Call objective</h3><p className="mt-2 whitespace-pre-wrap text-sm">{call.callContext.objective}</p></div>}<div className="space-y-2"><h3 className="text-xs font-semibold">Questions for this call</h3>{call.callContext?.questions.map((question, index) => <div key={question.fieldKey} className="rounded-lg border border-border p-3 text-xs"><p className="font-medium">{index + 1}. {question.label}{question.required ? ' · Required' : ''}</p><p className="mt-1 text-muted-foreground">{question.text}</p></div>)}</div></Tabs.Content>
          <Tabs.Content value="behavior" className="outline-none"><CallBehaviorTimeline call={call} /></Tabs.Content>
          <Tabs.Content value="notes" className="outline-none"><CallNotes call={call} /></Tabs.Content>
        </Tabs.Root>
      </div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
