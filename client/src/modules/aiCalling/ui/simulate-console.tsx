'use client';

import { useRef, useState } from 'react';
import { Send, Play, RotateCcw, Bot, User, Flag } from 'lucide-react';
import { showError } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';
import type { SimAction, SimResult, SimState } from '../types/ai-calling-types';
import { StatusPill } from './status-pill';

interface Turn { who: 'agent' | 'user' | 'system'; text: string }

function agentLine(action: SimAction): string {
  switch (action.type) {
    case 'disclose': return '[discloses it is an AI, asks permission to continue]';
    case 'ask': return action.question?.text || '';
    case 'clarify': return `(clarifying) ${action.question?.text || ''}`;
    case 'confirm': return `Let me confirm your answer to "${action.question?.label}" — is that right?`;
    case 'finish': return 'Thanks for your time — that is everything. Goodbye!';
    case 'end': return `[ends the call: ${action.reason}]`;
    default: return '';
  }
}

export function SimulateConsole({ campaignId }: { campaignId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<SimState | null>(null);
  const [action, setAction] = useState<SimAction | null>(null);
  const [preview, setPreview] = useState<SimResult['outcomePreview']>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ended = action?.type === 'finish' || action?.type === 'end';

  async function apply(result: SimResult, userTurn?: string) {
    setState(result.state);
    setAction(result.nextAction);
    setPreview(result.outcomePreview);
    setTurns((t) => {
      const next = [...t];
      if (userTurn) next.push({ who: 'user', text: userTurn });
      const line = agentLine(result.nextAction);
      if (line) next.push({ who: 'agent', text: line });
      return next;
    });
    setTimeout(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 50);
  }

  async function begin() {
    setBusy(true);
    try {
      setTurns([{ who: 'system', text: 'Simulated call started (no telephony).' }]);
      const result = await aiCallingApi.simulate(campaignId, { disclose: true });
      await apply(result);
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  async function send() {
    if (!input.trim() || !state || busy) return;
    const text = input.trim();
    setInput('');
    setBusy(true);
    try {
      const result = await aiCallingApi.simulate(campaignId, { state, userText: text });
      await apply(result, text);
    } catch (e) { showError(e); } finally { setBusy(false); }
  }

  function reset() { setTurns([]); setState(null); setAction(null); setPreview(null); }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-1 pb-2">
        <p className="text-xs text-muted-foreground">Browser test — runs the real question engine &amp; rules, no phone call.</p>
        {state ? (
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><RotateCcw className="h-3 w-3" /> Reset</button>
        ) : null}
      </div>

      {!state ? (
        <div className="flex flex-1 items-center justify-center">
          <button type="button" onClick={begin} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
            <Play className="h-4 w-4" /> Start simulation
          </button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3">
            {turns.map((t, i) => (
              <div key={i} className={`flex gap-2 ${t.who === 'user' ? 'flex-row-reverse' : ''}`}>
                {t.who !== 'system' ? (
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${t.who === 'agent' ? 'bg-brand-500/15 text-brand-500' : 'bg-muted text-muted-foreground'}`}>
                    {t.who === 'agent' ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                  </div>
                ) : null}
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${t.who === 'user' ? 'bg-brand-500 text-white' : t.who === 'system' ? 'mx-auto bg-muted/60 text-xs text-muted-foreground' : 'bg-muted'}`}>
                  {t.text}
                </div>
              </div>
            ))}
          </div>

          {preview ? (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <Flag className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Outcome preview:</span>
              <StatusPill status={preview.qualification} />
              <span className="text-muted-foreground">→ {preview.action.replace(/_/g, ' ')}</span>
              {preview.requiresReview ? <span className="text-rose-600">(needs review)</span> : null}
            </div>
          ) : null}

          {!ended ? (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500"
                placeholder="Type the lead's reply…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                disabled={busy}
              />
              <button type="button" onClick={send} disabled={busy || !input.trim()} className="rounded-lg bg-brand-500 p-2 text-white hover:bg-brand-600 disabled:opacity-50"><Send className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">Call ended. Reset to run again.</div>
          )}
        </>
      )}
    </div>
  );
}
