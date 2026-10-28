'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, MessageSquareText, UserRound } from 'lucide-react';
import type { CallTranscriptTurn } from '../types/ai-calling-types';

export function CallTranscript({ turns, live = false, agentName = 'AI agent', leadName = 'Lead', compact = false }: {
  turns: CallTranscriptTurn[]; live?: boolean; agentName?: string; leadName?: string; compact?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const latest = turns.at(-1)?.itemId;
  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [latest, follow]);

  if (!turns.length) return <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground"><MessageSquareText className="size-6 opacity-50" aria-hidden="true" /><p>{live ? 'Waiting for the conversation…' : 'No transcript is available for this call.'}</p>{live && <p className="max-w-sm leading-relaxed">The agent and lead’s words appear here as each spoken turn finishes.</p>}</div>;

  return <div className="min-w-0 space-y-2">
    <div ref={scroller} role="log" aria-label="Call conversation transcript" aria-live={live ? 'polite' : 'off'} aria-relevant="additions" onScroll={event => {
      const node = event.currentTarget;
      setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 60);
    }} className={`min-w-0 space-y-3 overflow-y-auto overscroll-contain pe-1 ${compact ? 'max-h-60' : 'max-h-[52dvh]'} scrollbar-thin`}>
      {turns.map(turn => {
        const assistant = turn.role === 'assistant';
        const Icon = assistant ? Bot : UserRound;
        return <div key={turn.itemId} className={`flex min-w-0 items-start gap-2 ${assistant ? '' : 'flex-row-reverse'}`}>
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${assistant ? 'bg-violet-500/10 text-violet-400' : 'bg-blue-500/10 text-blue-400'}`}><Icon className="size-3.5" aria-hidden="true" /></span>
          <div className={`min-w-0 max-w-[88%] space-y-1 rounded-xl border px-3 py-2.5 ${assistant ? 'border-violet-500/15 bg-violet-500/5' : 'border-blue-500/15 bg-blue-500/5'}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{assistant ? agentName : leadName}<span className="ms-1 font-normal text-muted-foreground">· {assistant ? 'AI agent' : 'Lead'}</span></span><time dateTime={turn.at}>{new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>
            <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{turn.text}</p>
            {turn.interrupted && <p className="text-[10px] text-muted-foreground">Interrupted</p>}
          </div>
        </div>;
      })}
    </div>
    {!follow && live && <button type="button" className="mx-auto flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-muted" onClick={() => setFollow(true)}><ArrowDown className="size-3" aria-hidden="true" />Jump to latest</button>}
  </div>;
}
