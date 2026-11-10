'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon, ArrowLeft, CheckCircle2, CircleDot, Clock, Link2, Pause, Play, RotateCcw, SkipForward, Square, User, Workflow as WorkflowIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useRunAction, useWorkflowCatalog, useWorkflowRun } from '../../hooks/use-workflows';
import { formatDateTime, formatRelative, leadName, personName, refId, refName } from '../../lib/format';
import { visualFor, CATEGORY_STYLES } from '../../lib/node-registry';
import type { RunAction, RunStep, WorkflowEventItem, WorkflowRunDetail } from '../../types/workflow-types';
import { OutcomeBadge, RunStatusBadge } from '../shared/status-badge';
import { WorkflowDiagram } from '../shared/workflow-diagram';
import { ErrorBlock, Panel, useNodeLabel } from './page-kit';

const ACTIVE = ['pending', 'queued', 'running', 'waiting', 'paused'];

export function allowedActions(run: Pick<WorkflowRunDetail, 'status' | 'wait'>): RunAction[] {
  const out: RunAction[] = [];
  if (['pending', 'queued', 'running', 'waiting'].includes(run.status)) out.push('pause');
  if (run.status === 'paused') out.push('resume');
  if (run.status === 'failed' || (run.status === 'waiting' && run.wait?.kind === 'retry')) out.push('retry');
  if (['failed', 'waiting', 'paused'].includes(run.status)) out.push('skip');
  if (ACTIVE.includes(run.status)) out.push('stop');
  return out;
}

const ACTION_ICONS = { pause: Pause, resume: Play, retry: RotateCcw, skip: SkipForward, stop: Square } as const;
const ACTION_LABELS: Record<RunAction, string> = { pause: 'Pause', resume: 'Resume', retry: 'Retry step', skip: 'Skip step', stop: 'Stop' };
const CONFIRM_TITLES: Record<RunAction, string> = {
  pause: 'Pause this execution?', resume: 'Resume this execution?', retry: 'Retry the failed step?', skip: 'Skip this step?', stop: 'Stop this execution?',
};

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return <pre dir="ltr" className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">{JSON.stringify(value, null, 2)}</pre>;
}

function StepCard({ step }: { step: RunStep }) {
  const { t, locale } = useLanguage();
  const trace = (step.output as { trace?: Array<{ field: string; operator: string; value: unknown; actual: unknown; result: boolean }> } | null)?.trace;
  const tone = step.status === 'completed' ? 'text-emerald-600' : step.status === 'failed' ? 'text-rose-600' : step.status === 'skipped' ? 'text-amber-600' : 'text-sky-600';
  return (
    <div className="space-y-2 rounded-xl border p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn('font-semibold', tone)}>{t(`workflowPages.stepStatus.${step.status}`, step.status)}{step.manual ? ` · ${t(`workflowPages.manual.${step.manual}`, step.manual)}` : ''}</span>
        <span className="text-muted-foreground">{t('workflowPages.inspector.visitAttempt', 'Visit {visit} · attempt {attempt}', { visit: step.visit, attempt: step.attempt })}</span>
      </div>
      {step.port && <p className="text-xs">{t('workflowPages.inspector.branch', 'Branch')}: <span className="font-semibold">{t(`workflow.port.${step.port}`, step.port)}</span></p>}
      <p className="text-[11px] text-muted-foreground">{formatDateTime(step.startedAt, locale)}{step.endedAt ? ` → ${formatDateTime(step.endedAt, locale)}` : ''}</p>
      {step.error?.message && <p className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300">{step.error.code ? `${step.error.code}: ` : ''}{step.error.message}</p>}
      {trace && (
        <ul className="space-y-1 text-xs">
          {trace.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              {r.result ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> : <CircleDot className="mt-0.5 size-3.5 shrink-0 text-rose-500" />}
              <span dir="ltr" className="font-mono">{r.field} {r.operator} {r.value === null ? '' : JSON.stringify(r.value)} <span className="text-muted-foreground">(= {JSON.stringify(r.actual)})</span></span>
            </li>
          ))}
        </ul>
      )}
      {step.output && !trace && <details><summary className="cursor-pointer text-xs text-muted-foreground">{t('workflowPages.inspector.output', 'Output data')}</summary><div className="mt-1.5"><JsonBlock value={step.output} /></div></details>}
    </div>
  );
}

export function ExecutionInspectorPage({ id }: { id: string }) {
  const { t, locale } = useLanguage();
  const nodeLabel = useNodeLabel();
  const { hasPermission } = usePermissions();
  const canExecute = hasPermission('workflow:execute');
  const query = useWorkflowRun(id);
  const { data: catalog } = useWorkflowCatalog();
  const action = useRunAction();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<RunAction | null>(null);
  const [port, setPort] = useState<string>('');
  const run = query.data;

  const graphNodes = useMemo(() => new Map((run?.version?.graph?.nodes || []).map((n) => [n.id, n])), [run?.version?.graph]);
  const labelOf = (nodeId?: string | null) => {
    if (!nodeId) return '';
    const n = graphNodes.get(nodeId);
    return n ? (n.data?.label || nodeLabel(n.type)) : nodeId;
  };
  const focusId = selected || run?.currentNodeId || run?.error?.nodeId || null;
  const focusSteps = (run?.steps || []).filter((s) => s.nodeId === focusId);
  const skipNode = run ? graphNodes.get(run.status === 'failed' ? (run.error?.nodeId || run.currentNodeId || '') : (run.currentNodeId || '')) : undefined;
  const skipOutputs = skipNode ? (catalog?.nodes.find((n) => n.type === skipNode.type)?.outputs || []) : [];

  if (query.isError) return <ErrorBlock onRetry={() => query.refetch()} />;
  if (!run) return <div className="space-y-4"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-[480px] rounded-2xl" /></div>;

  const lead = typeof run.leadId === 'object' ? run.leadId : null;
  const actions = allowedActions(run);
  const confirmAction = () => {
    if (!pending) return;
    action.mutate({ id: run._id, action: pending, port: pending === 'skip' ? (port || null) : null }, { onSettled: () => { setPending(null); setPort(''); } });
  };
  const timeline: WorkflowEventItem[] = [...(run.events || [])].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const callData = (run.context as { call?: Record<string, unknown> } | undefined)?.call;
  const analysis = (run.context as { analysis?: Record<string, unknown> } | undefined)?.analysis;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ms-2 gap-1"><Link href="/automation/executions"><ArrowLeft className="size-4 rtl:rotate-180" />{t('workflow.nav.executions', 'Executions')}</Link></Button>

      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between dark:border-white/10">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{leadName(run.leadId, t('workflow.common.unknownLead', 'Unknown lead'))}</h1>
            <RunStatusBadge status={run.status} />
            <OutcomeBadge outcome={run.outcome} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {lead && <Link href={`/leads?detail=${lead._id}`} className="inline-flex items-center gap-1 hover:text-primary"><User className="size-3.5" />{lead.leadNumber || t('workflowPages.inspector.openLead', 'Open lead')}</Link>}
            <Link href={`/automation/workflows/${refId(run.workflowId)}`} className="inline-flex items-center gap-1 hover:text-primary"><WorkflowIcon className="size-3.5" />{refName(run.workflowId)} · {t('workflow.common.version', 'v{version}', { version: run.version?.version ?? '' })}</Link>
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{t('workflowPages.inspector.started', 'Started {when}', { when: formatRelative(run.startedAt || run.createdAt, locale) })}</span>
            {run.trigger?.type && <span>{t('workflowPages.inspector.trigger', 'Trigger')}: {run.trigger.type === 'campaign' ? t('workflow.nav.campaigns', 'Campaigns') : nodeLabel(run.trigger.type)}</span>}
          </div>
        </div>
        {canExecute && actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const Icon = ACTION_ICONS[a];
              return (
                <Button key={a} size="sm" variant={a === 'stop' ? 'outline' : a === 'retry' || a === 'resume' ? 'default' : 'outline'} className={cn('gap-1.5', a === 'stop' && 'text-destructive hover:text-destructive')} onClick={() => setPending(a)}>
                  <Icon className="size-3.5" />{t(`workflowPages.inspector.action.${a}`, ACTION_LABELS[a])}
                </Button>
              );
            })}
          </div>
        )}
      </header>

      {run.status === 'failed' && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <AlertOctagon className="mt-0.5 size-5 shrink-0 text-rose-500" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{t('workflowPages.inspector.failedAt', 'Failed at “{step}”', { step: labelOf(run.error?.nodeId) || '—' })}</p>
            <p className="mt-0.5 break-words text-muted-foreground">{run.error?.code ? `${run.error.code}: ` : ''}{run.error?.message || ''}</p>
            {canExecute && <p className="mt-1 text-xs text-muted-foreground">{t('workflowPages.inspector.failedHint', 'Fix the cause (e.g. the agent or user), then retry the step — or skip it and continue on a branch you choose.')}</p>}
          </div>
        </div>
      )}
      {run.status === 'waiting' && run.wait?.kind && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-sky-700 dark:text-sky-300"><Clock className="size-4" />{t(`workflow.wait.${run.wait.kind}`, run.wait.kind)} · {labelOf(run.wait.nodeId)}</span>
          {run.wait.until && <span className="text-muted-foreground">{t('workflowPages.inspector.until', 'Until {when}', { when: formatDateTime(run.wait.until, locale) })}</span>}
          {run.nextRunAt && <span className="text-muted-foreground">{t('workflowPages.inspector.nextCheck', 'Next check {when}', { when: formatRelative(run.nextRunAt, locale) })}</span>}
          {run.wait.events?.length ? <span className="text-muted-foreground">{run.wait.events.map((e) => t(`workflow.waitEvent.${e}`, e)).join(', ')}</span> : null}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="h-[520px]">
          <WorkflowDiagram graph={run.version?.graph} run={{ steps: run.steps, currentNodeId: run.currentNodeId, status: run.status }} onNodeClick={setSelected} selectedNodeId={focusId} minimap />
        </div>
        <Panel title={focusId ? labelOf(focusId) : t('workflowPages.inspector.selectNode', 'Select a step')} description={focusId && graphNodes.get(focusId) ? nodeLabel(graphNodes.get(focusId)!.type) : t('workflowPages.inspector.selectNodeHint', 'Click a step in the diagram to see what happened there.')}
          icon={focusId && graphNodes.get(focusId) ? visualFor(graphNodes.get(focusId)!.type).icon : undefined} bodyClassName="max-h-[456px] space-y-3 overflow-y-auto">
          {!focusId ? null : focusSteps.length === 0 ? <p className="text-sm text-muted-foreground">{t('workflowPages.inspector.notReached', 'This step has not been reached in this execution.')}</p>
            : focusSteps.slice().reverse().map((s) => <StepCard key={s._id} step={s} />)}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title={t('workflowPages.inspector.timeline', 'Timeline')} description={t('workflowPages.inspector.timelineHint', 'Every event of this execution in order')}>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">{t('workflowPages.events.empty', 'No events yet.')}</p> : (
            <ol className="relative space-y-4 border-s ps-5 dark:border-white/10" data-testid="run-timeline">
              {timeline.map((e) => {
                const node = e.nodeId ? graphNodes.get(e.nodeId) : null;
                const cat = node ? visualFor(node.type).category : null;
                const failed = /failed/.test(e.type);
                const data = e.data || {};
                return (
                  <li key={e._id} className="relative">
                    <span className={cn('absolute -start-[27px] top-1 size-3 rounded-full border-2 border-background', failed ? 'bg-rose-500' : cat ? CATEGORY_STYLES[cat].dot : 'bg-slate-400')} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium">{t(`workflow.event.${e.type}`, e.type)}{node ? <span className="font-normal text-muted-foreground"> · {labelOf(e.nodeId)}</span> : null}</p>
                      <time className="text-xs text-muted-foreground" dateTime={e.at}>{formatDateTime(e.at, locale)}</time>
                    </div>
                    {typeof data.port === 'string' && <p className="text-xs text-muted-foreground">{t('workflowPages.inspector.branch', 'Branch')}: {t(`workflow.port.${data.port}`, data.port)}</p>}
                    {typeof data.kind === 'string' && <p className="text-xs text-muted-foreground">{t(`workflow.wait.${data.kind}`, data.kind)}{data.until ? ` · ${formatDateTime(String(data.until), locale)}` : ''}</p>}
                    {typeof data.message === 'string' && <p className="text-xs text-rose-600 dark:text-rose-400">{data.message}</p>}
                    {typeof data.reason === 'string' && <p className="text-xs text-muted-foreground">{data.reason}</p>}
                    {e.actor && <p className="text-xs text-muted-foreground">{personName(e.actor)}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title={t('workflowPages.inspector.collected', 'Collected data')} description={t('workflowPages.inspector.collectedHint', 'Validated call results and analysis used by conditions')}>
            {!callData && !analysis ? <p className="text-sm text-muted-foreground">{t('workflowPages.inspector.noData', 'No call or analysis data in this execution.')}</p> : (
              <div className="space-y-3">
                {callData && <div><p className="mb-1 text-xs font-semibold">{t('workflow.node.ai.call.label', 'AI call')}</p><JsonBlock value={callData} /></div>}
                {analysis && <div><p className="mb-1 text-xs font-semibold">{t('workflow.node.ai.analyze.label', 'Analyse conversation')}</p><JsonBlock value={analysis} /></div>}
              </div>
            )}
          </Panel>
          <Panel title={t('workflowPages.inspector.links', 'Tracked links')} icon={Link2}>
            {!run.links?.length ? <p className="text-sm text-muted-foreground">{t('workflowPages.inspector.noLinks', 'No tracked links were sent.')}</p> : (
              <ul className="space-y-2.5">
                {run.links.map((l) => (
                  <li key={l._id} className="rounded-xl border p-3 text-xs dark:border-white/10">
                    <p dir="ltr" className="truncate font-medium">{l.url}</p>
                    <p className="mt-1 text-muted-foreground">{t('workflowPages.inspector.clicks', '{human} genuine clicks · {scanner} scanner hits', { human: l.humanClicks, scanner: l.scannerHits })}</p>
                    {l.firstClickAt && <p className="text-muted-foreground">{t('workflowPages.inspector.firstClick', 'First click {when}', { when: formatDateTime(l.firstClickAt, locale) })}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) { setPending(null); setPort(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending ? t(`workflowPages.inspector.confirm.${pending}.title`, CONFIRM_TITLES[pending]) : ''}</DialogTitle>
            <DialogDescription>{pending ? t(`workflowPages.inspector.confirm.${pending}.desc`, '') : ''}</DialogDescription>
          </DialogHeader>
          {pending === 'skip' && skipOutputs.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('workflowPages.inspector.continueOn', 'Continue on branch')}</p>
              <Select value={port || skipOutputs[0]} onValueChange={setPort}>
                <SelectTrigger aria-label={t('workflowPages.inspector.continueOn', 'Continue on branch')}><SelectValue /></SelectTrigger>
                <SelectContent>{skipOutputs.map((p) => <SelectItem key={p} value={p}>{t(`workflow.port.${p}`, p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('workflowPages.inspector.audited', 'This action is recorded in the audit log and the execution history.')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>{t('workflowPages.common.cancel', 'Cancel')}</Button>
            <Button variant={pending === 'stop' ? 'destructive' : 'default'} disabled={action.isPending} onClick={confirmAction} data-testid="confirm-run-action">
              {pending ? t(`workflowPages.inspector.action.${pending}`, ACTION_LABELS[pending]) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
