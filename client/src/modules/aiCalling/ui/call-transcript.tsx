'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDown, Bot, MessageSquareText, UserRound } from 'lucide-react';
import type { CallTranscriptTurn } from '../types/ai-calling-types';

function scrollToBottom(node: HTMLDivElement | null) {
  if (node) node.scrollTop = node.scrollHeight;
}

/** Wraps the first occurrence of the evidence quote (whitespace-insensitive) in a <mark>. */
function withQuote(text: string, quote?: string | null) {
  const needle = quote?.replace(/\s+/g, ' ').trim();
  if (!needle) return text;
  const flat = text.replace(/\s+/g, ' ');
  const start = flat.indexOf(needle);
  if (start < 0) return text;
  return <>{flat.slice(0, start)}<mark className="rounded bg-cyan-400/25 px-0.5 text-inherit ring-1 ring-cyan-400/40">{needle}</mark>{flat.slice(start + needle.length)}</>;
}

export function CallTranscript({ turns, live = false, agentName = 'AI agent', leadName = 'Lead', compact = false, highlight = null, idPrefix, scrollContainerRef }: {
  turns: CallTranscriptTurn[]; live?: boolean; agentName?: string; leadName?: string; compact?: boolean;
  /** Evidence to show: the turn is outlined and the quote marked. */
  highlight?: { turnIndex: number; quote?: string | null } | null;
  /** Gives each turn the DOM id `${idPrefix}-${index}` so evidence links can scroll to it. */
  idPrefix?: string;
  /** A drawer supplies its single scroll viewport, avoiding nested scroll traps. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const latest = turns.at(-1);
  const hasTurns = turns.length > 0;
  const scrollToLatest = () => {
    scrollToBottom(scrollContainerRef?.current ?? scroller.current);
  };
  useEffect(() => {
    const node = scrollContainerRef?.current ?? scroller.current;
    const content = scroller.current;
    if (!node || !content) return;
    const onScroll = () => {
      const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
      followRef.current = atBottom;
      setFollow(atBottom);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (followRef.current) scrollToBottom(node);
    });
    resize?.observe(content);
    return () => { node.removeEventListener('scroll', onScroll); resize?.disconnect(); };
  }, [scrollContainerRef, hasTurns]);
  useEffect(() => {
    if (followRef.current) {
      scrollToBottom(scrollContainerRef?.current ?? scroller.current);
    }
  }, [latest?.itemId, latest?.text, latest?.interrupted, turns.length, scrollContainerRef]);
  useEffect(() => {
    if (highlight) followRef.current = false;
  }, [highlight]);

  if (!turns.length) return <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground"><MessageSquareText className="size-6 opacity-50" aria-hidden="true" /><p>{live ? 'Waiting for the conversation…' : 'No transcript is available for this call.'}</p>{live && <p className="max-w-sm leading-relaxed">The agent and lead’s words appear here as each spoken turn finishes.</p>}</div>;

  return <div className="min-w-0 space-y-2">
    <div ref={scroller} role="log" aria-label="Call conversation transcript" aria-live={live ? 'polite' : 'off'} aria-relevant="additions text" tabIndex={scrollContainerRef ? undefined : 0} className={`min-w-0 space-y-3 pe-1 ${scrollContainerRef ? '' : `overflow-y-auto overscroll-contain ${compact ? 'max-h-60' : 'max-h-[52dvh]'} scrollbar-thin`}`}>
      {turns.map((turn, index) => {
        const assistant = turn.role === 'assistant';
        const lit = highlight?.turnIndex === index;
        const Icon = assistant ? Bot : UserRound;
        return <div key={turn.itemId} id={idPrefix ? `${idPrefix}-${index}` : undefined} data-turn-index={index} className={`flex min-w-0 items-start gap-2 ${assistant ? '' : 'flex-row-reverse'}`}>
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${assistant ? 'bg-blue-500/10 text-sky-400' : 'bg-blue-500/10 text-blue-400'}`}><Icon className="size-3.5" aria-hidden="true" /></span>
          <div className={`min-w-0 max-w-[88%] space-y-1 rounded-xl border px-3 py-2.5 ${lit ? 'border-cyan-400/60 bg-cyan-400/10 ring-2 ring-cyan-400/30' : 'border-blue-500/15 bg-blue-500/5'}`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{assistant ? agentName : leadName}<span className="ms-1 font-normal text-muted-foreground">· {assistant ? 'AI agent' : 'Lead'}</span></span><time dateTime={turn.at}>{new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div>
            <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{lit ? withQuote(turn.text, highlight?.quote) : turn.text}</p>
            {turn.interrupted && <p className="text-[10px] text-muted-foreground">Interrupted</p>}
          </div>
        </div>;
      })}
    </div>
    {!follow && live && <button type="button" className={`${scrollContainerRef ? 'absolute bottom-4 start-1/2 z-20 -translate-x-1/2 rtl:translate-x-1/2' : 'mx-auto'} flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium shadow-lg hover:bg-muted`} onClick={() => { followRef.current = true; setFollow(true); scrollToLatest(); }}><ArrowDown className="size-3" aria-hidden="true" />Jump to latest</button>}
  </div>;
}
