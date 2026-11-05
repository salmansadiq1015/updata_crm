'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Hand, Headphones, Loader2, PhoneOff, PhoneMissed, Radio, Smartphone, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallControl, useInboundDevices, useInboundLive } from '../hooks/use-inbound-calls';
import { allowedControls, callerDisplay, deviceSimLabel, enumLabel, formatDuration, isAiConnected, type T } from '../inbound-domain';
import type { ControlKind, LiveCall } from '../types/inbound-call-types';
import { WorkPill, AiPill, AudioPill, CallerTypeBadge, CallStatusPill, ConfirmAction, EmptyState, ErrorState, Pill, SkeletonBlocks, cardClass, primaryClass, secondaryClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

const CONTROL_ICON: Record<ControlKind, typeof Bot> = { answer: Bot, reject: PhoneMissed, takeover: Headphones, hangup: PhoneOff };

export function NoPhoneEmpty({ t }: { t: T }) {
  return <EmptyState icon={Smartphone} title={t('inbound.empty.noPhone', 'No phone connected yet')} hint={t('inbound.empty.noPhoneHint', 'Pair your phone with the Updata gateway in AI Calling → Connections. Incoming calls on that phone then appear here.')} action={<Link href="/ai-calling?tab=connections" className={primaryClass}>{t('inbound.empty.openConnections', 'Open AI Calling connections')}</Link>} />;
}

export function LiveMonitorTab({ onOpenCall }: { onOpenCall: (id: string) => void }) {
  const { t } = useInboundLanguage();
  const live = useInboundLive();
  const devices = useInboundDevices();
  const control = useCallControl(t);
  const [confirm, setConfirm] = useState<{ call: LiveCall; kind: ControlKind } | null>(null);

  if (live.isLoading) return <SkeletonBlocks count={2} className="h-48" label={t('inbound.common.loading', 'Loading…')} />;
  if (live.isError && !live.data) return <div className={cardClass}><ErrorState t={t} onRetry={() => live.refetch()} /></div>;
  const calls = live.data ?? [];
  if (!calls.length) {
    return <div className={cardClass}>{devices.data && devices.data.length === 0 ? <NoPhoneEmpty t={t} /> : <EmptyState icon={Radio} title={t('inbound.live.empty', 'No calls in progress')} hint={t('inbound.live.emptyHint', 'This view updates by itself. When a connected phone rings you will see the caller, what the AI hears and says, and controls to take over.')} />}</div>;
  }

  const run = async () => {
    if (!confirm) return;
    try { await control.mutateAsync({ id: confirm.call.id, kind: confirm.kind }); setConfirm(null); } catch { /* toast shown by the mutation */ }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-cyan-500" />{t('inbound.live.updating', 'Live — updates as the call progresses')}</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {calls.map((call) => <LiveCallCard key={call.id} call={call} t={t} simText={deviceSimLabel(devices.data, call.device?.id, call.sim.slot, call.sim.label)} busyKind={control.isPending && control.variables?.id === call.id ? control.variables.kind : null} onControl={(kind) => setConfirm({ call, kind })} onOpen={() => onOpenCall(call.id)} />)}
      </div>
      {confirm ? (
        <ConfirmAction
          title={t(`inbound.control.confirm.${confirm.kind}.title`, enumLabel(t, 'control', confirm.kind))}
          description={t(`inbound.control.confirm.${confirm.kind}.body`, '')}
          confirmLabel={enumLabel(t, 'control', confirm.kind)} cancelLabel={t('inbound.common.cancel', 'Cancel')}
          danger={confirm.kind === 'reject' || confirm.kind === 'hangup'} busy={control.isPending}
          onConfirm={() => void run()} onClose={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}

function LiveCallCard({ call, t, simText, busyKind, onControl, onOpen }: { call: LiveCall; t: T; simText: string; busyKind: ControlKind | null; onControl: (k: ControlKind) => void; onOpen: () => void }) {
  const controls = allowedControls(call);
  const aiConnected = isAiConnected(call.aiStatus);
  const speaking = call.agentActivity?.speaker;
  return (
    <article aria-label={callerDisplay(call, t)} className={cn(cardClass, 'flex min-w-0 flex-col overflow-hidden', call.handoff && call.handoff.status === 'waiting' && 'border-amber-400/50')}>
      {call.handoff ? (
        <div role="alert" className="flex items-start gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          <Hand className="mt-0.5 size-4 shrink-0" />
          <span><strong>{t('inbound.live.handoffTitle', 'The caller asked to speak to a person.')}</strong> {enumLabel(t, 'handoff', call.handoff.status)}{call.handoff.reason ? ` — ${call.handoff.reason}` : ''}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-semibold">{callerDisplay(call, t)}</h3><CallerTypeBadge type={call.callerType} t={t} /></div>
          <p className="mt-0.5 text-xs text-muted-foreground">{call.caller.number || t('inbound.caller.withheld', 'Withheld number')}{call.lead ? <> · <Link href={`/leads?detail=${call.lead.id}`} className="text-primary hover:underline">{call.lead.name || call.lead.number}</Link></> : null}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{call.device?.name || '—'} · {simText} · {call.agent?.name || t('inbound.live.noAgent', 'No AI agent')}{call.language ? ` · ${call.language.toUpperCase()}` : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <CallStatusPill status={call.status} t={t} />
          {call.workStatus ? <WorkPill value={call.workStatus} source={call.workSource} t={t} /> : null}
          {call.answeredAt ? <span className="font-mono text-xs tabular-nums text-muted-foreground"><LiveTimer since={call.answeredAt} /></span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4">
        {call.handling === 'ai' || call.aiStatus !== 'not_applicable' ? <AiPill status={call.aiStatus} t={t} /> : <Pill>{t('inbound.live.humanHandled', 'Handled on the phone')}</Pill>}
        <AudioPill status={call.audioStatus} t={t} />
        {call.handling === 'ai' && !aiConnected && call.aiStatus !== 'ended' ? <span className="text-[11px] text-muted-foreground">{t('inbound.live.aiNotConnected', 'The AI is not connected to the caller yet.')}</span> : null}
        {aiConnected && speaking ? <span className="text-[11px] text-cyan-700 dark:text-cyan-300">{speaking === 'assistant' ? t('inbound.live.aiSpeaking', 'AI is speaking') : t('inbound.live.callerSpeaking', 'Caller is speaking')}</span> : null}
        {call.aiBlockedBy ? <Pill tone="warning">{enumLabel(t, 'reason', call.aiBlockedBy)}</Pill> : null}
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('inbound.live.transcript', 'Conversation')}</p>
          {call.lastTurns.length ? (
            <ol className="max-h-48 space-y-1.5 overflow-y-auto">
              {call.lastTurns.map((turn, i) => (
                <li key={`${i}-${turn.at}`} dir="auto" className={cn('rounded-lg px-2.5 py-1.5 text-xs [overflow-wrap:anywhere]', turn.role === 'assistant' ? 'bg-primary/8 text-foreground' : turn.role === 'caller' ? 'bg-muted' : 'text-muted-foreground italic')}>
                  <span className="me-1 font-semibold">{turn.role === 'assistant' ? t('inbound.transcript.ai', 'AI') : turn.role === 'caller' ? t('inbound.transcript.caller', 'Caller') : t('inbound.transcript.system', 'System')}:</span>{turn.text}
                </li>
              ))}
            </ol>
          ) : <p className="text-xs text-muted-foreground">{t('inbound.live.noTranscript', 'Nothing said yet.')}</p>}
        </div>
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('inbound.live.collected', 'Collected so far')}</p>
          {call.collected.length ? (
            <dl className="space-y-1 text-xs">
              {call.collected.map((f, i) => <div key={`${f.key}-${i}`} className="flex gap-1.5"><dt className="shrink-0 text-muted-foreground">{enumLabel(t, 'field', f.key)}:</dt><dd className="min-w-0 font-medium [overflow-wrap:anywhere]">{f.value}{!f.explicit ? <span className="ms-1 text-[10px] text-amber-600">({t('inbound.fields.inferred', 'inferred')})</span> : null}</dd></div>)}
            </dl>
          ) : <p className="text-xs text-muted-foreground">{t('inbound.live.nothingCollected', 'No details saved yet.')}</p>}
          {call.questionCount ? <p className="mt-2 text-[11px] text-muted-foreground">{t('inbound.live.questions', '{count} caller questions recorded', { count: call.questionCount })}</p> : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {call.pendingCommand ? <span role="status" className="inline-flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300"><Loader2 className="size-3.5 animate-spin" />{t('inbound.live.pending', 'Waiting for the phone: {command}', { command: enumLabel(t, 'control', call.pendingCommand) })}</span> : null}
        <div className="ms-auto flex flex-wrap gap-2">
          {controls.map((kind) => {
            const Icon = CONTROL_ICON[kind];
            const pending = busyKind === kind || call.pendingCommand === kind;
            return <button key={kind} type="button" disabled={pending || Boolean(busyKind)} onClick={() => onControl(kind)} className={cn(kind === 'answer' || kind === 'takeover' ? primaryClass : secondaryClass, 'h-9 min-h-0 px-3 text-xs', (kind === 'reject' || kind === 'hangup') && 'text-rose-600 dark:text-rose-400')}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}{enumLabel(t, 'control', kind)}</button>;
          })}
          <button type="button" className={cn(secondaryClass, 'h-9 min-h-0 px-3 text-xs')} onClick={onOpen}><UserRound className="size-3.5" />{t('inbound.live.details', 'Details')}</button>
        </div>
      </div>
    </article>
  );
}

function LiveTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useTicker(setNow);
  const seconds = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return <>{formatDuration(seconds)}</>;
}

function useTicker(set: (n: number) => void) {
  useEffect(() => { const id = setInterval(() => set(Date.now()), 1000); return () => clearInterval(id); }, [set]);
}

