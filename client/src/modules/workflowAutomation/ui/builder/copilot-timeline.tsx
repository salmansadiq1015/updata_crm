'use client';
import { useEffect, useState } from 'react';
import {
  AlertTriangle, Brain, ChevronDown, Database, LayoutGrid, LayoutTemplate, Link2, MessageCircleQuestion, MousePointerClick, PenLine,
  ScanSearch, ShieldCheck, SlidersHorizontal, SquarePlus, Trash2, Unlink, Wand2, Wrench, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { CopilotEvent } from '../../services/copilot-stream';

/**
 * Live timeline of one copilot turn: understanding → resources → thinking rounds → each tool call
 * (with the model's own plan text) → validation → answer. Durations are measured on the client.
 */
export type TimelineKind = 'understand' | 'resources' | 'think' | 'repair' | 'validate' | 'tool' | 'question' | 'answer';
export type TimelineState = 'running' | 'done' | 'warn' | 'stopped';
export interface TimelineItem {
  id: string; kind: TimelineKind; label: string; state: TimelineState; t0: number; t1?: number;
  tool?: string; detail?: string; thought?: string; round?: number;
}

type T = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => string;

const close = (items: TimelineItem[], now: number, state: TimelineState = 'done') =>
  items.map((it) => (it.state === 'running' ? { ...it, state, t1: now } : it));

export function startTimeline(now: number, t: T): TimelineItem[] {
  return [{ id: 'understand', kind: 'understand', label: t('workflowCopilot.tl.understand', 'Understanding your request'), state: 'running', t0: now }];
}

/** Pure reducer: apply one stream event to the timeline (unknown events leave it unchanged). */
export function timelineReduce(items: TimelineItem[], e: CopilotEvent, now: number, t: T): TimelineItem[] {
  switch (e.type) {
    case 'status': {
      if (e.key === 'resources') {
        const detail = e.agents != null ? t('workflowCopilot.tl.resourcesDetail', 'Agents: {agents} · Templates: {templates}', { agents: e.agents, templates: e.templates ?? 0 }) : undefined;
        return [...close(items, now), { id: `res-${now}`, kind: 'resources', label: t('workflowCopilot.tl.resources', 'Loaded your agents and templates'), state: 'done', t0: now, t1: now, detail }];
      }
      if (e.key === 'thinking' || e.key === 'repairing') {
        const repair = e.key === 'repairing';
        const label = repair ? t('workflowCopilot.tl.repair', 'Fixing the remaining problems')
          : (e.round ?? 1) > 1 ? t('workflowCopilot.tl.thinkMore', 'Thinking about the next step') : t('workflowCopilot.tl.think', 'Thinking');
        return [...close(items, now), { id: `think-${e.round ?? now}-${now}`, kind: repair ? 'repair' : 'think', label, state: 'running', t0: now, round: e.round }];
      }
      if (e.key === 'validating') {
        return [...close(items, now), { id: `val-${now}`, kind: 'validate', label: t('workflowCopilot.tl.blocking', 'Blocking problems found — repairing'), state: 'warn', t0: now, t1: now }];
      }
      return items;
    }
    case 'thought': {
      const idx = [...items].reverse().findIndex((it) => it.kind === 'think' || it.kind === 'repair');
      if (idx < 0) return items;
      const at = items.length - 1 - idx;
      return items.map((it, i) => (i === at ? { ...it, thought: e.text } : it));
    }
    case 'tool_start':
      return [...close(items, now), { id: e.callId, kind: e.name === 'validate_workflow' ? 'validate' : 'tool', tool: e.name, label: e.step || t(`workflowCopilot.op.${e.name}`, e.name), state: 'running', t0: now }];
    case 'op': {
      const label = e.change.direct ? t('workflowCopilot.appliedChoice', 'Applied your choice') : e.step || t(`workflowCopilot.op.${e.name}`, e.name);
      if (e.callId && items.some((it) => it.id === e.callId)) {
        return items.map((it) => (it.id === e.callId ? { ...it, label: it.label || label, state: 'done', t1: now } : it));
      }
      return [...close(items, now), { id: e.callId || `op-${now}-${items.length}`, kind: 'tool', tool: e.change.direct ? 'apply' : e.name, label, state: 'done', t0: now, t1: now }];
    }
    case 'op_error': {
      if (e.callId && items.some((it) => it.id === e.callId)) {
        return items.map((it) => (it.id === e.callId ? { ...it, state: 'warn', t1: now, detail: e.message } : it));
      }
      return [...close(items, now), { id: `err-${now}-${items.length}`, kind: 'tool', tool: e.name, label: t('workflowCopilot.adjusting', 'Adjusting a step'), state: 'warn', t0: now, t1: now, detail: e.message }];
    }
    case 'tool_done':
      return items.map((it) => (it.id === e.callId ? {
        ...it, state: e.errors ? 'warn' : 'done', t1: now,
        detail: e.name === 'validate_workflow'
          ? (e.errors ? t('workflowCopilot.tl.checkErrors', 'Blocking: {errors} · Warnings: {warnings}', { errors: e.errors, warnings: e.warnings ?? 0 }) : t('workflowCopilot.tl.checkClean', 'No blocking problems · Warnings: {warnings}', { warnings: e.warnings ?? 0 }))
          : it.detail,
      } : it));
    case 'question':
      return [...close(items, now), { id: `q-${now}`, kind: 'question', label: t('workflowCopilot.tl.question', 'Asked you a question'), state: 'done', t0: now, t1: now }];
    case 'message': {
      const last = items[items.length - 1];
      const relabeled = last && last.state === 'running' && (last.kind === 'think' || last.kind === 'repair')
        ? [...items.slice(0, -1), { ...last, kind: 'answer' as const, label: t('workflowCopilot.tl.answer', 'Writing the answer') }] : items;
      return close(relabeled, now);
    }
    case 'done':
      return close(items, now);
    case 'error':
      return close(items, now, 'stopped');
    default:
      return items;
  }
}

export const finishTimeline = (items: TimelineItem[] | undefined, now: number, aborted: boolean) => close(items || [], now, aborted ? 'stopped' : 'done');

const TOOL_ICONS: Record<string, LucideIcon> = {
  add_node: SquarePlus, update_node: SlidersHorizontal, connect_nodes: Link2, disconnect: Unlink, remove_node: Trash2, tidy_layout: LayoutGrid,
  start_from_template: LayoutTemplate, set_workflow_name: PenLine, validate_workflow: ShieldCheck, apply: MousePointerClick,
};
function iconFor(it: TimelineItem): LucideIcon {
  if (it.kind === 'understand') return ScanSearch;
  if (it.kind === 'resources') return Database;
  if (it.kind === 'think') return Brain;
  if (it.kind === 'repair') return Wrench;
  if (it.kind === 'validate') return ShieldCheck;
  if (it.kind === 'question') return MessageCircleQuestion;
  if (it.kind === 'answer') return PenLine;
  return TOOL_ICONS[it.tool || ''] || Wand2;
}

export const formatSeconds = (ms: number) => (ms < 1000 ? `${Math.max(0, ms / 1000).toFixed(1)} s` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function CopilotTimeline({ items, live, startedAt, endedAt, defaultOpen }: { items: TimelineItem[]; live: boolean; startedAt?: number; endedAt?: number; defaultOpen: boolean }) {
  const { t } = useLanguage();
  const now = useNow(live);
  const [open, setOpen] = useState(defaultOpen);
  const shown = live || open;
  const t0 = startedAt ?? items[0]?.t0 ?? now;
  const total = (live ? now : endedAt ?? items.reduce((m, it) => Math.max(m, it.t1 ?? it.t0), t0)) - t0;
  const current = [...items].reverse().find((it) => it.state === 'running');
  const steps = items.filter((it) => it.kind === 'tool' || it.kind === 'validate').length;
  const warnings = items.filter((it) => it.state === 'warn').length;

  return (
    <div className="wf-tl overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-b from-card to-card/60 shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset,0_8px_24px_-12px_rgb(14_165_233/0.25)]">
      <button type="button" onClick={() => !live && setOpen((o) => !o)} aria-expanded={shown} disabled={live}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start disabled:cursor-default">
        <span className={cn('wf-tl-orb relative grid size-7 shrink-0 place-items-center rounded-full', live ? 'wf-tl-orb-live' : 'bg-sky-500/10')} aria-hidden>
          {live ? <span className="size-2 rounded-full bg-white shadow-[0_0_10px_2px_rgb(34_211_238/0.8)]" /> : <Brain className="size-3.5 text-sky-600 dark:text-sky-300" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px] font-medium', live && 'wf-tl-shimmer')}>
            {live ? (current?.label || t('workflowCopilot.working', 'Working…')) : t('workflowCopilot.tl.worked', 'Worked for {time}', { time: formatSeconds(total) })}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {[t('workflowCopilot.tl.steps', '{count} steps', { count: steps }), warnings ? t('workflowCopilot.tl.adjusted', '{count} adjusted', { count: warnings }) : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground" aria-live="off">{formatSeconds(total)}</span>
        {!live && <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', shown && 'rotate-180')} aria-hidden />}
      </button>

      {shown && (
        <ol className="relative space-y-0.5 border-t border-border/50 px-3.5 pb-3 pt-2.5" aria-label={t('workflowCopilot.tl.aria', 'What the AI did')}>
          <span aria-hidden className="absolute bottom-5 start-[27px] top-5 w-px bg-gradient-to-b from-sky-500/50 via-cyan-400/25 to-transparent" />
          {items.map((it) => {
            const Icon = iconFor(it);
            const dur = (it.t1 ?? (it.state === 'running' ? now : it.t0)) - it.t0;
            const action = it.kind === 'tool' || it.kind === 'validate';
            // Finished thinking rounds collapse into a quiet "Thought for 1.6 s" line between the actions.
            if ((it.kind === 'think' || it.kind === 'repair') && it.state !== 'running') {
              return (
                <li key={it.id} className="wf-tl-in relative grid grid-cols-[26px_minmax(0,1fr)] items-start gap-x-2.5 py-0.5">
                  <span aria-hidden className="relative z-10 mx-auto mt-[7px] size-1.5 rounded-full bg-sky-500/50 ring-4 ring-card" />
                  <span className="min-w-0">
                    <span className="block text-[11px] leading-5 text-muted-foreground">
                      {it.kind === 'repair' ? t('workflowCopilot.tl.repaired', 'Repaired for {time}', { time: formatSeconds(dur) }) : t('workflowCopilot.tl.thought', 'Thought for {time}', { time: formatSeconds(dur) })}
                    </span>
                    {it.thought && <span className="mb-1 block border-s-2 border-sky-500/30 ps-2 text-[11px] italic leading-4 text-muted-foreground">{it.thought}</span>}
                  </span>
                </li>
              );
            }
            return (
              <li key={it.id} className="wf-tl-in relative grid grid-cols-[26px_minmax(0,1fr)_auto] items-start gap-x-2.5 py-1">
                <span className={cn('relative z-10 mt-px grid size-[26px] place-items-center rounded-full border bg-card transition-colors duration-300',
                  it.state === 'running' && 'border-sky-500/60 text-sky-600 dark:text-sky-300',
                  it.state === 'done' && (action ? 'border-emerald-500/40 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-border text-sky-600/90 dark:text-sky-300/90'),
                  it.state === 'warn' && 'border-amber-500/50 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
                  it.state === 'stopped' && 'border-border text-muted-foreground')}>
                  {it.state === 'running' && <span aria-hidden className="wf-tl-ping absolute inset-0 rounded-full border border-sky-400/70" />}
                  {it.state === 'warn' ? <AlertTriangle className="size-3" /> : <Icon className="size-3" />}
                </span>
                <span className="min-w-0 pt-[3px]">
                  <span className={cn('block text-xs font-medium leading-5', it.state === 'running' && 'wf-tl-shimmer', it.state === 'stopped' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{it.label}</span>
                  {it.detail && <span className={cn('block text-[11px] leading-4', it.state === 'warn' ? 'text-amber-700 dark:text-amber-300/90' : 'text-muted-foreground')}>{it.detail}</span>}
                  {it.thought && <span className="mt-1 block border-s-2 border-sky-500/30 ps-2 text-[11px] italic leading-4 text-muted-foreground">{it.thought}</span>}
                </span>
                <span className="pt-[5px] font-mono text-[10.5px] tabular-nums text-muted-foreground/80">{dur >= 50 || it.state === 'running' ? formatSeconds(dur) : ''}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
