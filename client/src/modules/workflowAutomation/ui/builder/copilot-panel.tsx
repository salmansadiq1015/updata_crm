'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Check, Eye, Loader2, MessageSquarePlus, RotateCcw, Sparkles, Square, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CopilotHttpError, streamCopilot, type CopilotApply, type CopilotEvent, type CopilotOption } from '../../services/copilot-stream';
import type { WorkflowGraph } from '../../types/workflow-types';

interface Step { label: string; state: 'done' | 'adjusted'; detail?: string }
interface Question { question: string; kind: string; options: CopilotOption[]; allowFreeText: boolean }
/** Review mode: proposed changes are staged here until the user applies or discards them. */
interface Pending { graph: WorkflowGraph; name: string | null; count: number }
interface Msg {
  id: string; role: 'user' | 'assistant'; content: string;
  steps?: Step[]; question?: Question | null; changed?: boolean; opsApplied?: number; error?: string | null; streaming?: boolean; phase?: string | null;
  pending?: Pending | null; outcome?: 'applied' | 'discarded' | null;
}
export interface CopilotAgentInfo { _id: string; name: string; availability?: string; usage?: string; agentConfig?: { language?: string }; description?: string }
export interface CopilotHelpRequest { text: string; nonce: number }

interface Props {
  workflowId: string;
  readOnly: boolean;
  getGraph: () => WorkflowGraph;
  selectedNodeId: string | null;
  agents: CopilotAgentInfo[];
  helpRequest: CopilotHelpRequest | null;
  onTurnStart: (turnId: string) => void;
  onGraph: (graph: WorkflowGraph, touchedNodeId: string | null) => void;
  onRename: (name: string) => void;
  onUndoTurn: (messageId: string) => boolean;
  onTurnEnd: () => void;
  onClose: () => void;
  /** Review before apply: changes are proposed in the chat and only reach the canvas on “Apply”. */
  reviewMode?: boolean;
  onToggleReview?: () => void;
}

const STORAGE = (id: string) => `updata.wf-copilot.${id}`;

/** Minimal, safe rendering of the assistant's Markdown (bold + lists + paragraphs; no HTML). */
function RichText({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list; blocks.push(L.ordered ? <ol key={blocks.length} className="ms-4 list-decimal space-y-0.5">{L.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ol> : <ul key={blocks.length} className="ms-4 list-disc space-y-0.5">{L.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ul>); list = null; } };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line); const ul = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (ol || ul) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ol || ul)![1]);
    } else { flush(); if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>); }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
const uid = () => Math.random().toString(36).slice(2, 10);

export function CopilotPanel({ workflowId, readOnly, getGraph, selectedNodeId, agents, helpRequest, onTurnStart, onGraph, onRename, onUndoTurn, onTurnEnd, onClose, reviewMode = false, onToggleReview }: Props) {
  const { t, locale } = useLanguage();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE(workflowId)) || '[]') as Msg[]; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastHelp = useRef<number | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE(workflowId), JSON.stringify(messages.map((m) => ({ ...m, streaming: false })).slice(-40))); } catch { /* storage unavailable */ }
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, workflowId]);

  const patchLast = useCallback((fn: (m: Msg) => Msg) => setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? fn(m) : m))), []);

  const hasPending = messages.some((m) => m.pending);
  const send = useCallback(async (text: string, apply: CopilotApply | null = null) => {
    const content = text.trim();
    if (!content || busy || readOnly || hasPending) return;
    const staged = reviewMode; // fixed for the whole turn
    const history = [...messages, { id: uid(), role: 'user' as const, content }];
    const assistantId = uid();
    setMessages([...history, { id: assistantId, role: 'assistant', content: '', steps: [], streaming: true, phase: 'understanding' }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    let started = false;
    const onEvent = (e: CopilotEvent) => {
      if (e.type === 'status') patchLast((m) => ({ ...m, phase: e.key }));
      else if (e.type === 'op') {
        const label = e.change.direct ? t('workflowCopilot.appliedChoice', 'Applied your choice') : e.step || t(`workflowCopilot.op.${e.name}`, e.name);
        if (staged) {
          patchLast((m) => ({ ...m, phase: 'building', pending: { graph: e.graph, name: m.pending?.name ?? null, count: (m.pending?.count || 0) + 1 }, steps: [...(m.steps || []), { label, state: 'done' }] }));
          return;
        }
        if (!started) { onTurnStart(assistantId); started = true; }
        onGraph(e.graph, e.change.nodeId || e.change.to || null);
        patchLast((m) => ({ ...m, phase: 'building', changed: true, steps: [...(m.steps || []), { label, state: 'done' }] }));
      } else if (e.type === 'op_error') {
        patchLast((m) => ({ ...m, steps: [...(m.steps || []), { label: t('workflowCopilot.adjusting', 'Adjusting a step'), state: 'adjusted', detail: e.message }] }));
      } else if (e.type === 'rename') {
        if (staged) patchLast((m) => (m.pending ? { ...m, pending: { ...m.pending, name: e.name } } : m));
        else onRename(e.name);
      }
      else if (e.type === 'message') patchLast((m) => ({ ...m, content: e.text || m.content }));
      else if (e.type === 'question') patchLast((m) => ({ ...m, question: { question: e.question, kind: e.kind, options: e.options || [], allowFreeText: e.allowFreeText } }));
      else if (e.type === 'done') patchLast((m) => ({ ...m, streaming: false, phase: null, changed: staged ? false : e.changed, opsApplied: e.opsApplied, pending: staged && e.changed && m.pending ? { ...m.pending, graph: e.graph } : null }));
      else if (e.type === 'error') patchLast((m) => ({ ...m, streaming: false, phase: null, error: e.message }));
    };
    try {
      await streamCopilot(workflowId, {
        messages: history.map((m) => ({ role: m.role, content: m.role === 'assistant' && m.question ? `${m.content}\n${m.question.question}`.trim() : m.content })).filter((m) => m.content).slice(-20),
        graph: getGraph(), selectedNodeId, locale, ...(apply ? { apply } : {}),
      }, onEvent, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        const msg = error instanceof CopilotHttpError
          ? (error.code === 'AI_NOT_CONFIGURED' ? t('workflowCopilot.error.notConfigured', 'The AI assistant is not configured on this server.') : error.status === 429 ? t('workflowCopilot.error.rate', 'Too many requests — please wait a moment.') : error.status === 403 ? t('workflowCopilot.error.forbidden', 'You do not have permission to edit this workflow.') : error.message)
          : t('workflowCopilot.error.network', 'The connection to the AI assistant was interrupted.');
        patchLast((m) => ({ ...m, error: msg }));
      }
    } finally {
      // A stopped or failed staged turn proposes nothing: half-built changes are never offered.
      patchLast((m) => ({ ...m, streaming: false, phase: null, pending: controller.signal.aborted || m.error ? null : m.pending, content: m.content || (controller.signal.aborted ? t('workflowCopilot.stopped', 'Stopped.') : m.content) }));
      setBusy(false);
      abort.current = null;
      onTurnEnd();
    }
  }, [busy, readOnly, hasPending, reviewMode, messages, patchLast, onTurnStart, onGraph, onRename, onTurnEnd, workflowId, getGraph, selectedNodeId, locale, t]);

  const applyPending = (id: string) => {
    const m = messages.find((x) => x.id === id);
    if (!m?.pending || readOnly) return;
    onTurnStart(id); // snapshot → per-turn undo keeps working
    onGraph(m.pending.graph, null);
    if (m.pending.name) onRename(m.pending.name);
    onTurnEnd();
    setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, pending: null, outcome: 'applied', changed: true, opsApplied: m.pending!.count } : x)));
  };
  const discardPending = (id: string) => setMessages((ms) => ms.map((x) => (x.id === id ? { ...x, pending: null, outcome: 'discarded' } : x)));

  useEffect(() => {
    if (helpRequest && helpRequest.nonce !== lastHelp.current) { lastHelp.current = helpRequest.nonce; void send(helpRequest.text); }
  }, [helpRequest, send]);

  const suggestions = [
    t('workflowCopilot.suggest.qualify', 'Create an AI lead qualification workflow for new leads'),
    t('workflowCopilot.suggest.recovery', 'Retry unanswered calls after 24 hours, at most 3 times'),
    t('workflowCopilot.suggest.whatsapp', 'Send qualified leads a WhatsApp message and notify sales'),
    t('workflowCopilot.suggest.explain', 'Explain what this workflow does'),
    t('workflowCopilot.suggest.check', 'Check this workflow for problems and fix them'),
  ];
  const agentById = new Map(agents.map((a) => [a._id, a]));

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-sky-500/[0.04] to-transparent">
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-sm"><Sparkles className="size-4.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('workflowCopilot.title', 'Workflow Copilot')}</p>
          <p className="truncate text-xs text-muted-foreground">{t('workflowCopilot.subtitle', 'Describe what you want — I build it on the canvas.')}</p>
        </div>
        {onToggleReview && (
          <Button variant={reviewMode ? 'secondary' : 'ghost'} size="icon" className={cn('size-8', reviewMode && 'text-sky-700 dark:text-sky-300')} disabled={busy} onClick={onToggleReview} aria-pressed={reviewMode}
            aria-label={t('workflowCopilot.reviewMode', 'Review changes before applying')} title={reviewMode ? t('workflowCopilot.reviewOn', 'Review mode on: changes are proposed first') : t('workflowCopilot.reviewOff', 'Review mode off: changes are applied live')}>
            <Eye className="size-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" disabled={busy || !messages.length || hasPending} onClick={() => setMessages([])} aria-label={t('workflowCopilot.newChat', 'New conversation')} title={t('workflowCopilot.newChat', 'New conversation')}><MessageSquarePlus className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label={t('workflowBuilder.panel.close', 'Close')}><X className="size-4" /></Button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {!messages.length && (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><Wand2 className="size-4 text-sky-500" />{t('workflowCopilot.introTitle', 'Build with AI')}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('workflowCopilot.intro', 'Tell me in your own words what should happen. I use your real AI agents and templates, ask when something is missing and build the steps live. Nothing is published until you do it.')}</p>
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button key={s} type="button" disabled={readOnly || hasPending} onClick={() => void send(s)}
                  className="w-full rounded-xl border bg-background px-3 py-2.5 text-start text-sm transition-colors hover:border-sky-500/50 hover:bg-sky-500/5 disabled:opacity-50">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (m.role === 'user' ? (
          <div key={m.id} className="flex justify-end"><p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-ee-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.content}</p></div>
        ) : (
          <div key={m.id} className="space-y-2.5">
            {(m.steps?.length || m.streaming) ? (
              <div className="rounded-xl border bg-card p-3">
                <ol className="space-y-1.5">
                  {m.phase && m.phase !== 'building' && (
                    <li className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-sky-500" />{t(`workflowCopilot.phase.${m.phase}`, m.phase)}</li>
                  )}
                  {(m.steps || []).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      {s.state === 'done' ? <Check className="mt-px size-3.5 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-500" />}
                      <span className={cn(s.state === 'adjusted' && 'text-muted-foreground')} title={s.detail}>{s.label}</span>
                    </li>
                  ))}
                  {m.streaming && m.phase === 'building' && <li className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-sky-500" />{t('workflowCopilot.working', 'Working…')}</li>}
                </ol>
              </div>
            ) : null}
            {m.content && <RichText text={m.content} />}
            {m.error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{m.error}</p>}
            {m.question && (
              <div className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
                <p className="text-sm font-medium">{m.question.question}</p>
                <div className="grid gap-1.5">
                  {m.question.options.map((o) => {
                    const agent = m.question?.kind === 'agent' ? agentById.get(o.value) : null;
                    return (
                      <button key={o.value} type="button" disabled={busy || hasPending || m !== messages[messages.length - 1]} onClick={() => void send(o.label + (agent ? ` (id ${o.value})` : ''), o.apply ?? null)}
                        className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-start transition-colors hover:border-sky-500/50 disabled:opacity-60">
                        {agent && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-semibold text-sky-700 dark:text-sky-300">{agent.name.slice(0, 2).toUpperCase()}</span>}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{o.label}</span>
                          {(o.description || agent) && <span className="block text-xs text-muted-foreground">{[o.description, agent?.agentConfig?.language && agent.agentConfig.language !== 'auto' ? agent.agentConfig.language.toUpperCase() : null, agent?.availability ? t(`workflowBuilder.agentState.${agent.availability}`, agent.availability) : null].filter(Boolean).join(' · ')}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {m.pending && !m.streaming && (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3" role="group" aria-label={t('workflowCopilot.proposedTitle', 'Proposed changes')}>
                <p className="text-sm font-medium">{t('workflowCopilot.proposed', '{count} change(s) proposed — not applied yet', { count: m.pending.count })}</p>
                {m.pending.name && <p className="text-xs text-muted-foreground">{t('workflowCopilot.proposedName', 'New name: {name}', { name: m.pending.name })}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => applyPending(m.id)} disabled={readOnly}><Check className="me-1 size-3.5" />{t('workflowCopilot.apply', 'Apply to canvas')}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => discardPending(m.id)}>{t('workflowCopilot.discard', 'Discard')}</Button>
                </div>
              </div>
            )}
            {m.outcome === 'discarded' && <p className="text-xs text-muted-foreground">{t('workflowCopilot.discarded', 'Proposed changes discarded — the canvas was not changed.')}</p>}
            {m.changed && !m.streaming && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300"><Check className="size-3" />{t('workflowCopilot.applied', '{count} change(s) applied to the canvas', { count: m.opsApplied ?? m.steps?.filter((s) => s.state === 'done').length ?? 0 })}</span>
                <button type="button" className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-2 hover:underline" onClick={() => { if (onUndoTurn(m.id)) setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, changed: false, content: `${x.content}\n\n${t('workflowCopilot.undone', '↩ These changes were undone.')}` } : x))); }}>
                  <RotateCcw className="size-3" />{t('workflowCopilot.undo', 'Undo these changes')}
                </button>
              </div>
            )}
          </div>
        )))}
      </div>

      <form className="border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        {hasPending && <p className="mb-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t('workflowCopilot.resolvePending', 'Apply or discard the proposed changes first.')}</p>}
        {selectedNodeId && <p className="mb-1.5 text-[11px] text-muted-foreground">{t('workflowCopilot.contextNode', 'Talking about the selected step')}</p>}
        <div className="relative">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} maxLength={4000} disabled={readOnly || hasPending}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder={readOnly ? t('workflowCopilot.readOnly', 'This workflow is read-only.') : t('workflowCopilot.placeholder', 'e.g. “Call every new lead with Aria. If interested, send a WhatsApp and notify sales.”')}
            aria-label={t('workflowCopilot.inputLabel', 'Message to the Workflow Copilot')}
            className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 pe-12 text-sm outline-none focus:ring-2 focus:ring-ring/30" />
          {busy
            ? <Button type="button" size="icon" variant="outline" className="absolute bottom-2.5 end-2 size-8" onClick={() => abort.current?.abort()} aria-label={t('workflowCopilot.stop', 'Stop')}><Square className="size-3.5" /></Button>
            : <Button type="submit" size="icon" className="absolute bottom-2.5 end-2 size-8" disabled={!input.trim() || readOnly || hasPending} aria-label={t('workflowCopilot.send', 'Send')}><ArrowUp className="size-4" /></Button>}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{t('workflowCopilot.footer', 'AI changes the draft only — review, test and publish yourself.')}</p>
      </form>
    </div>
  );
}
