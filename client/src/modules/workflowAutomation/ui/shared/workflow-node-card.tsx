'use client';
import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertCircle, AlertTriangle, CheckCircle2, CircleSlash, Flag, Loader2, Sparkles, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CATEGORY_STYLES, PORT_TONE_CLASSES, portTone, visualFor } from '../../lib/node-registry';
import type { NodeConfig } from '../../types/workflow-types';

export type RuntimeState = 'completed' | 'failed' | 'skipped' | 'current' | 'waiting' | 'pending';

export interface CanvasNodeData extends Record<string, unknown> {
  label?: string;
  config: NodeConfig;
  outputs: string[];
  summary?: string;
  issues?: number;
  warnings?: number;
  runtime?: RuntimeState;
  visits?: number;
  takenPorts?: string[];
  readOnly?: boolean;
  /** Briefly highlighted after the Workflow Copilot added or changed this step. */
  aiFlash?: boolean;
}
export type CanvasNode = Node<CanvasNodeData>;

const RUNTIME_RING: Record<RuntimeState, string> = {
  completed: 'ring-2 ring-emerald-500/70',
  failed: 'ring-2 ring-rose-500/80',
  skipped: 'ring-2 ring-amber-500/70',
  current: 'ring-2 ring-sky-500 shadow-[0_0_0_6px_rgb(14_165_233/0.15)]',
  waiting: 'ring-2 ring-sky-500 shadow-[0_0_0_6px_rgb(14_165_233/0.15)]',
  pending: 'opacity-55 saturate-50',
};
const RUNTIME_PILL: Partial<Record<RuntimeState, string>> = {
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  skipped: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  current: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  waiting: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

function RuntimeIcon({ state }: { state: RuntimeState }) {
  if (state === 'completed') return <CheckCircle2 className="size-3.5" aria-hidden />;
  if (state === 'failed') return <XCircle className="size-3.5" aria-hidden />;
  if (state === 'skipped') return <CircleSlash className="size-3.5" aria-hidden />;
  if (state === 'current' || state === 'waiting') return <Loader2 className="size-3.5 animate-spin" aria-hidden />;
  return null;
}

export const NODE_CARD_WIDTH = 304;

function WorkflowNodeCardImpl({ id, type, data, selected }: NodeProps<CanvasNode>) {
  const { t } = useLanguage();
  const visual = visualFor(type);
  const style = CATEGORY_STYLES[visual.category];
  const Icon = visual.icon;
  const isTrigger = visual.category === 'trigger';
  const isEnd = visual.category === 'end';
  const outputs = data.outputs || [];
  const typeLabel = t(`workflow.node.${type}.label`, type);
  const custom = Boolean(data.label?.trim()) && data.label?.trim() !== typeLabel;
  const title = custom ? data.label!.trim() : typeLabel;
  const summaryLines = (data.summary || '').split('\n').filter(Boolean).slice(0, 3);
  const intentionalEnd = Boolean((data.config as { intentionalEnd?: boolean })?.intentionalEnd);

  return (
    <div
      data-testid={`wf-node-${id}`}
      style={{ width: NODE_CARD_WIDTH }}
      className={cn(
        'group relative rounded-2xl border bg-card text-card-foreground transition-[box-shadow,transform] duration-150',
        'border-border/80 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_10px_28px_-14px_rgb(15_23_42/0.22)] dark:border-white/10 dark:bg-slate-900/90 dark:shadow-[0_10px_30px_-12px_rgb(0_0_0/0.65)]',
        selected && 'ring-2 ring-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_16%,transparent)]',
        data.runtime && RUNTIME_RING[data.runtime],
        data.aiFlash && 'wf-ai-flash',
        !data.readOnly && 'hover:-translate-y-px hover:shadow-[0_2px_4px_rgb(15_23_42/0.08),0_16px_36px_-16px_rgb(15_23_42/0.3)]',
      )}
    >
      <span className={cn('absolute inset-y-4 start-0 w-[3px] rounded-e-full', style.accent)} aria-hidden />
      {!isTrigger && (
        <Handle type="target" position={Position.Top} id="in" isConnectable={!data.readOnly}
          className="!size-3.5 !border-[2.5px] !border-background !bg-slate-400 transition-colors group-hover:!bg-primary dark:!border-slate-900" />
      )}

      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', style.icon)}><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-semibold leading-[18px]" title={title}>{title}</p>
            {data.aiFlash && <Sparkles className="mt-0.5 size-3.5 shrink-0 text-sky-500" aria-hidden />}
            {(data.issues || 0) > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400" title={t('workflowBuilder.node.issues', '{count} issues', { count: data.issues })}>
                <AlertCircle className="size-3" aria-hidden />{data.issues}
              </span>
            ) : (data.warnings || 0) > 0 ? (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400" title={t('workflowBuilder.node.warnings', '{count} warnings', { count: data.warnings })}>
                <AlertTriangle className="size-3" aria-hidden />{data.warnings}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {isTrigger ? t('workflowBuilder.node.triggerTag', 'Trigger') : custom ? typeLabel : t(`workflow.category.${visual.category}`, visual.category)}
          </p>
          {summaryLines.length > 0 && (
            <div className="mt-1.5 space-y-0.5 text-xs leading-4 text-foreground/75 dark:text-slate-300">
              {summaryLines.map((line, i) => <p key={i} className="line-clamp-2 break-words">{line}</p>)}
            </div>
          )}
          {(data.runtime && RUNTIME_PILL[data.runtime]) || (data.visits || 0) > 1 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {data.runtime && RUNTIME_PILL[data.runtime] && (
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', RUNTIME_PILL[data.runtime])}>
                  <RuntimeIcon state={data.runtime} />{t(`workflowBuilder.runtime.${data.runtime}`, data.runtime)}
                </span>
              )}
              {(data.visits || 0) > 1 && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">{t('workflowBuilder.node.visits', '{count}× run', { count: data.visits })}</span>}
            </div>
          ) : null}
        </div>
      </div>

      {!isEnd && outputs.length > 1 && (
        <div className="grid border-t border-border/70 dark:border-white/10" style={{ gridTemplateColumns: `repeat(${outputs.length}, minmax(0, 1fr))` }}>
          {outputs.map((port, i) => {
            const tone = portTone(port);
            const taken = data.takenPorts?.includes(port);
            const label = t(`workflow.port.${port}`, port);
            return (
              <div key={port} title={label}
                className={cn('relative flex min-h-[38px] items-start justify-center gap-1 px-1 pb-2.5 pt-2 text-center text-[11px] font-medium leading-[13px]',
                  i > 0 && 'border-s border-border/50 dark:border-white/5', data.takenPorts && !taken && 'opacity-40')}>
                <span className={cn('mt-[3px] size-1.5 shrink-0 rounded-full', PORT_TONE_CLASSES[tone].split(' ')[0])} aria-hidden />
                <span className={cn('break-words [hyphens:auto]', PORT_TONE_CLASSES[tone].split(' ').slice(1).join(' '))}>{label}</span>
                <Handle type="source" position={Position.Bottom} id={port} isConnectable={!data.readOnly}
                  className={cn('!-bottom-[7px] !size-3.5 !border-[2.5px] !border-background transition-transform hover:!scale-125 dark:!border-slate-900', PORT_TONE_CLASSES[tone].split(' ')[0].replace('bg-', '!bg-'))} />
              </div>
            );
          })}
        </div>
      )}
      {!isEnd && outputs.length === 1 && (
        <Handle type="source" position={Position.Bottom} id={outputs[0]} isConnectable={!data.readOnly}
          className="!size-3.5 !border-[2.5px] !border-background !bg-slate-400 transition-colors hover:!scale-125 group-hover:!bg-primary dark:!border-slate-900" />
      )}
      {intentionalEnd && !isEnd && (
        <span className="absolute -bottom-3 end-3 inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground shadow-sm">
          <Flag className="size-3" aria-hidden />{t('workflowBuilder.node.intentionalEnd', 'Ends here')}
        </span>
      )}
    </div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardImpl);
