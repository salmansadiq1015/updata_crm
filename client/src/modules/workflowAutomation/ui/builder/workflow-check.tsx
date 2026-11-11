'use client';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleSlash, Crosshair, Loader2, Mail, MessageCircle, MessageSquareText, PhoneCall,
  RefreshCw, Repeat, Route, ShieldCheck, Sparkles, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CATEGORY_STYLES, visualFor } from '../../lib/node-registry';
import { OutcomeBadge } from '../shared/status-badge';
import type { CheckIssue, CheckNode, CheckPath, EndOutcome, TestRunResult, WorkflowCheckReport } from '../../types/workflow-types';

/**
 * "Full check" view of the Test dialog: is this workflow going to work? Shows a verdict, the live
 * channels, every step with its problems (each with "Show on canvas" and "Fix with AI"), and every
 * path from the trigger to its end. Nothing here calls, sends or changes anything.
 */
type T = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => string;
const CHANNEL_ICON = { voice: PhoneCall, sms: MessageSquareText, whatsapp: MessageCircle, email: Mail } as const;
const CHANNEL_LABEL: Record<string, string> = { voice: 'AI calling', sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email' };
const REASON_LABEL: Record<string, string> = {
  not_enabled: 'no provider is switched on', not_configured: 'the provider is switched on but not configured',
  provider_down: 'the provider failed its last health check', check_failed: 'the status could not be checked', no_agent: 'no AI agent is chosen yet',
};
const channelName = (c: string | undefined, t: T) => t(`workflowBuilder.check.channel.${c}`, CHANNEL_LABEL[c || ''] || c || '');
const reasonText = (r: string | null | undefined, t: T) => (r && /^[a-z_]+$/.test(r) ? t(`workflowBuilder.check.reason.${r}`, REASON_LABEL[r] || r) : r || '');

export function issueText(issue: CheckIssue, t: T): string {
  if (issue.code === 'channel_unavailable') {
    const channel = channelName(issue.channel, t);
    const reason = reasonText(issue.reason, t);
    return t('workflowBuilder.check.channelDown', '{channel} is not ready: {reason}', { channel, reason });
  }
  if (issue.code === 'dry_run_failed') return t('workflowBuilder.check.dryFailed', 'This step failed in the dry run: {message}', { message: issue.message || '—' });
  const base = t(`workflowBuilder.validation.${issue.code}`, issue.code);
  const field = issue.field ? t(`workflowBuilder.form.${issue.field.split('.')[0]}`, '') : '';
  const ports = issue.ports?.length ? ` (${issue.ports.map((p) => t(`workflow.port.${p}`, p)).join(', ')})` : '';
  return `${field ? `${field}: ` : ''}${base}${ports}`;
}
export function fixText(issue: CheckIssue, t: T): string {
  if (issue.code === 'channel_unavailable') return t(`workflowBuilder.check.fixChannel.${issue.channel}`, '');
  if (issue.code === 'dry_run_failed') return t('workflowBuilder.check.fixDry', '');
  return t(`workflowBuilder.fix.${issue.code}`, '');
}

const stepName = (n: { label: string; type: string }, t: T) => n.label || t(`workflow.node.${n.type}.label`, n.type);

/** Problems the copilot can repair in the workflow itself (a missing phone line or provider needs a person). */
export const aiFixable = (i: CheckIssue) => i.code !== 'channel_unavailable';

/** Prompt for the copilot to repair one step (or everything when `nodes` has several entries). */
export function fixPrompt(nodes: CheckNode[], general: CheckIssue[], t: T): string {
  const lines = [
    ...general.filter(aiFixable).map((i) => `- ${issueText(i, t)}`),
    ...nodes.flatMap((n) => n.issues.filter(aiFixable).map((i) => `- “${stepName(n, t)}”: ${issueText(i, t)}`)),
  ];
  if (nodes.length === 1 && !general.length) {
    return t('workflowBuilder.check.promptOne', 'Fix the step “{name}” so it works:\n{problems}\nKeep everything else unchanged. Ask me if you need information (for example which agent or template to use).', { name: stepName(nodes[0], t), problems: lines.join('\n') });
  }
  return t('workflowBuilder.check.promptAll', 'Fix these problems in this workflow so it is ready to publish:\n{problems}\nKeep everything else unchanged. Ask me if you need information (for example which agent or template to use).', { problems: lines.join('\n') });
}

/** A path → the test-path overlay the canvas already knows how to draw. */
export function pathAsResult(path: CheckPath, nodes: CheckNode[], label: string): TestRunResult {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return {
    valid: true, validation: { valid: true, errors: [], warnings: [] }, outcome: path.end,
    lead: { _id: '', name: label, status: '' },
    steps: path.steps.map((s) => ({ nodeId: s.nodeId, type: byId.get(s.nodeId)?.type || '', label: byId.get(s.nodeId)?.label || '', status: 'completed', port: s.port || null })),
  } as TestRunResult;
}

interface Props {
  report: WorkflowCheckReport | null;
  loading: boolean;
  error: string | null;
  readOnly: boolean;
  onRerun: () => void;
  onFocusNode: (nodeId: string) => void;
  onAskAi: (prompt: string) => void;
  onShowPath: (result: TestRunResult) => void;
}

export function WorkflowCheck({ report, loading, error, readOnly, onRerun, onFocusNode, onAskAi, onShowPath }: Props) {
  const { t } = useLanguage();
  const [showOk, setShowOk] = useState(false);
  const [showAllPaths, setShowAllPaths] = useState(false);
  const sorted = useMemo(() => {
    const rank = { error: 0, warning: 1, ok: 2 } as const;
    return [...(report?.nodes || [])].sort((a, b) => rank[a.status] - rank[b.status]);
  }, [report]);

  if (loading && !report) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-6 animate-spin text-sky-500" />
        <span className="wf-tl-shimmer font-medium">{t('workflowBuilder.check.running', 'Checking every step, path and channel…')}</span>
      </div>
    );
  }
  if (error) return <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>;
  if (!report) return null;

  const problemNodes = sorted.filter((n) => n.status !== 'ok');
  const okNodes = sorted.filter((n) => n.status === 'ok');
  const verdict = {
    ready: { icon: ShieldCheck, cls: 'border-emerald-500/40 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200', title: t('workflowBuilder.check.ready', 'Ready to publish'), text: t('workflowBuilder.check.readyText', 'Every step is configured, every path ends with an outcome and all channels are live.') },
    attention: { icon: AlertTriangle, cls: 'border-amber-500/40 bg-amber-500/[0.07] text-amber-900 dark:text-amber-100', title: t('workflowBuilder.check.attention', 'Works, but needs attention'), text: t('workflowBuilder.check.attentionText', 'Nothing blocks publishing, but some branches or settings may not do what you expect.') },
    blocked: { icon: XCircle, cls: 'border-rose-500/40 bg-rose-500/[0.07] text-rose-800 dark:text-rose-200', title: t('workflowBuilder.check.blocked', 'Not ready yet'), text: t('workflowBuilder.check.blockedText', 'Fix the problems below — yourself, or let the AI Copilot do it.') },
  }[report.status];
  const V = verdict.icon;
  const channels = Object.entries(report.channels) as Array<[keyof typeof CHANNEL_ICON, NonNullable<WorkflowCheckReport['channels']['voice']>]>;
  const paths = showAllPaths ? report.paths.paths : report.paths.paths.slice(0, 6);
  const fixableNodes = problemNodes.filter((n) => n.issues.some(aiFixable));
  const hasProblems = fixableNodes.length > 0 || report.general.some(aiFixable);

  return (
    <div className="space-y-5" aria-live="polite">
      <div className={cn('flex flex-wrap items-start gap-4 rounded-2xl border p-4', verdict.cls)}>
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-background/70 shadow-sm"><V className="size-5.5" /></span>
        <div className="min-w-[200px] flex-1">
          <p className="text-base font-semibold">{verdict.title}</p>
          <p className="mt-0.5 text-sm opacity-90">{verdict.text}</p>
          <p className="mt-1 text-[11px] opacity-75">{report.lead ? t('workflowBuilder.check.withLead', 'Steps were dry-run with {lead}.', { lead: report.lead.name }) : t('workflowBuilder.check.withSample', 'Steps were dry-run with a sample lead — pick a real lead under “Simulation” to use its data.')}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t('workflowBuilder.check.statSteps', 'Steps OK')} value={`${report.counts.stepsOk}/${report.counts.steps}`} />
          <Stat label={t('workflowBuilder.check.statProblems', 'Problems')} value={String(report.counts.errors + report.counts.warnings)} tone={report.counts.errors ? 'bad' : report.counts.warnings ? 'warn' : 'good'} />
          <Stat label={t('workflowBuilder.check.statPaths', 'Paths ending')} value={`${report.counts.endingPaths}/${report.paths.total}`} tone={report.counts.openPaths ? 'warn' : 'good'} />
        </div>
      </div>

      {channels.length > 0 && (
        <section aria-label={t('workflowBuilder.check.channels', 'Channels')}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('workflowBuilder.check.channels', 'Channels')}</h3>
          <div className="flex flex-wrap gap-2">
            {channels.map(([key, c]) => {
              const Icon = CHANNEL_ICON[key] || ShieldCheck;
              const reason = reasonText(c.reason, t);
              return (
                <div key={key} className={cn('flex max-w-full items-start gap-2 rounded-xl border px-3 py-2 text-xs', c.ready ? 'border-emerald-500/30' : 'border-rose-500/40 bg-rose-500/[0.05]')}>
                  <Icon className={cn('mt-px size-4 shrink-0', c.ready ? 'text-emerald-500' : 'text-rose-500')} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{channelName(key, t)} · {c.ready ? t('workflowBuilder.check.live', 'live') : t('workflowBuilder.check.notLive', 'not ready')}</span>
                    {!c.ready && reason && <span className="block max-w-[360px] text-muted-foreground">{reason}</span>}
                    {!c.ready && <span className="mt-1 block max-w-[360px] font-medium text-foreground/80">{t(`workflowBuilder.check.fixChannel.${key}`, '')}</span>}
                    {!c.ready && <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{t('workflowBuilder.check.setupNote', 'Set-up outside the workflow — the AI Copilot cannot change this.')}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {report.general.length > 0 && (
        <section className="space-y-2">
          {report.general.map((i, k) => (
            <IssueRow key={k} issue={i} t={t} />
          ))}
        </section>
      )}

      <section aria-label={t('workflowBuilder.check.steps', 'Steps')}>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('workflowBuilder.check.steps', 'Steps')}</h3>
        <ul className="space-y-2">
          {problemNodes.map((n) => <StepCard key={n.nodeId} node={n} t={t} readOnly={readOnly} onFocus={onFocusNode} onAskAi={() => onAskAi(fixPrompt([n], [], t))} />)}
        </ul>
        {okNodes.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowOk((v) => !v)} aria-expanded={showOk} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300">
              <CheckCircle2 className="size-3.5" />{t('workflowBuilder.check.okSteps', '{count} steps work as configured', { count: okNodes.length })}
              <ChevronDown className={cn('size-3.5 transition-transform', showOk && 'rotate-180')} />
            </button>
            {showOk && <ul className="mt-2 space-y-2">{okNodes.map((n) => <StepCard key={n.nodeId} node={n} t={t} readOnly={readOnly} onFocus={onFocusNode} />)}</ul>}
          </div>
        )}
      </section>

      <section aria-label={t('workflowBuilder.check.paths', 'Paths')}>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Route className="size-3.5" />{t('workflowBuilder.check.paths', 'Paths')} · {report.paths.total}{report.paths.truncated ? '+' : ''}</h3>
        <ul className="space-y-1.5">
          {paths.map((p, i) => (
            <PathRow key={i} index={i} path={p} nodes={report.nodes} t={t} readOnly={readOnly}
              onShow={() => onShowPath(pathAsResult(p, report.nodes, t('workflowBuilder.check.pathN', 'Path {n}', { n: i + 1 })))}
              onAskAi={() => onAskAi(t('workflowBuilder.check.promptPath', 'The path {path} stops without an End step. Connect it to the right next step or an End step with the correct outcome.', { path: p.steps.map((s) => { const n = report.nodes.find((x) => x.nodeId === s.nodeId); return `“${n ? stepName(n, t) : s.nodeId}”${s.port ? ` (${t(`workflow.port.${s.port}`, s.port)})` : ''}`; }).join(' → ') }))} />
          ))}
        </ul>
        {report.paths.paths.length > 6 && (
          <button type="button" onClick={() => setShowAllPaths((v) => !v)} className="mt-2 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300">
            {showAllPaths ? t('workflowBuilder.check.fewerPaths', 'Show fewer') : t('workflowBuilder.check.morePaths', 'Show all {count} paths', { count: report.paths.paths.length })}
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={onRerun} disabled={loading}>{loading ? <Loader2 className="me-1.5 size-3.5 animate-spin" /> : <RefreshCw className="me-1.5 size-3.5" />}{t('workflowBuilder.check.rerun', 'Check again')}</Button>
        {hasProblems && !readOnly && (
          <Button type="button" size="sm" className="ms-auto bg-gradient-to-r from-sky-600 to-cyan-500 text-white hover:from-sky-700 hover:to-cyan-600" onClick={() => onAskAi(fixPrompt(fixableNodes, report.general, t))}>
            <Sparkles className="me-1.5 size-3.5" />{t('workflowBuilder.check.fixAll', 'Fix everything with AI')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className="min-w-[78px] rounded-xl bg-background/70 px-2.5 py-1.5 shadow-sm">
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'good' && 'text-emerald-600 dark:text-emerald-300', tone === 'warn' && 'text-amber-600 dark:text-amber-300', tone === 'bad' && 'text-rose-600 dark:text-rose-300')}>{value}</p>
      <p className="text-[10.5px] font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function IssueRow({ issue, t }: { issue: CheckIssue; t: T }) {
  const fix = fixText(issue, t);
  return (
    <li className="flex list-none items-start gap-2 text-xs">
      {issue.severity === 'error' ? <XCircle className="mt-px size-3.5 shrink-0 text-rose-500" /> : issue.severity === 'warning' ? <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-500" /> : <CircleSlash className="mt-px size-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0">
        <span className="block font-medium">{issueText(issue, t)}</span>
        {fix && <span className="block text-muted-foreground">{fix}</span>}
      </span>
    </li>
  );
}

function StepCard({ node, t, readOnly, onFocus, onAskAi }: { node: CheckNode; t: T; readOnly: boolean; onFocus: (id: string) => void; onAskAi?: () => void }) {
  const v = visualFor(node.type); const Icon = v.icon;
  const dry = node.dryRun;
  return (
    <li className={cn('rounded-xl border p-3', node.status === 'error' && 'border-rose-500/40', node.status === 'warning' && 'border-amber-500/40')}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', CATEGORY_STYLES[v.category].icon)}><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{stepName(node, t)}</span>
          <span className="block text-[11px] text-muted-foreground">{t(`workflow.node.${node.type}.label`, node.type)}</span>
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', node.status === 'ok' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', node.status === 'warning' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300', node.status === 'error' && 'bg-rose-500/10 text-rose-700 dark:text-rose-300')}>
          {t(`workflowBuilder.check.status.${node.status}`, node.status)}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onFocus(node.nodeId)}><Crosshair className="me-1 size-3.5" />{t('workflowBuilder.check.show', 'Show on canvas')}</Button>
        {onAskAi && node.issues.some(aiFixable) && !readOnly && (
          <Button type="button" variant="outline" size="sm" className="h-7 border-sky-500/40 px-2 text-xs text-sky-700 dark:text-sky-300" onClick={onAskAi}><Sparkles className="me-1 size-3.5" />{t('workflowBuilder.check.fixAi', 'Fix with AI')}</Button>
        )}
      </div>
      {node.issues.length > 0 && <ul className="mt-2.5 space-y-1.5 ps-[42px]">{node.issues.map((i, k) => <IssueRow key={k} issue={i} t={t} />)}</ul>}
      {dry && (
        <p className="mt-2 flex items-center gap-1.5 ps-[42px] text-[11px] text-muted-foreground">
          {dry.status === 'ok' ? <CheckCircle2 className="size-3 text-emerald-500" /> : <XCircle className="size-3 text-rose-500" />}
          {dry.status === 'ok'
            ? (dry.port ? t('workflowBuilder.check.dryOkPort', 'Dry run: works, continues via “{port}”', { port: t(`workflow.port.${dry.port}`, dry.port) }) : t('workflowBuilder.check.dryOk', 'Dry run: works'))
            : t('workflowBuilder.check.dryFailedShort', 'Dry run failed: {message}', { message: dry.error?.message || '—' })}
        </p>
      )}
    </li>
  );
}

function PathRow({ index, path, nodes, t, readOnly, onShow, onAskAi }: { index: number; path: CheckPath; nodes: CheckNode[]; t: T; readOnly: boolean; onShow: () => void; onAskAi: () => void }) {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return (
    <li className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2', path.status === 'open' && 'border-amber-500/40 bg-amber-500/[0.04]')}>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[11.5px]">
        {path.steps.map((s, i) => {
          const n = byId.get(s.nodeId);
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="font-medium">{n ? stepName(n, t) : s.nodeId}</span>
              {s.port && s.port !== 'out' && <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{t(`workflow.port.${s.port}`, s.port)}</span>}
              {i < path.steps.length - 1 && <ArrowRight className="size-3 text-muted-foreground/70 rtl:rotate-180" />}
            </span>
          );
        })}
      </span>
      {path.status === 'ends' && path.end && <OutcomeBadge outcome={path.end as EndOutcome} />}
      {path.status === 'repeats' && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"><Repeat className="size-3" />{t('workflowBuilder.check.pathRepeats', 'Repeats (bounded)')}</span>}
      {path.status === 'stops' && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t('workflowBuilder.check.pathStops', 'Stops on purpose')}</span>}
      {path.status === 'open' && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t('workflowBuilder.check.pathOpen', 'No End step')}</span>}
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onShow}>{t('workflowBuilder.check.showPath', 'Show path')}</Button>
      {path.status === 'open' && !readOnly && <Button type="button" variant="outline" size="sm" className="h-7 border-sky-500/40 px-2 text-xs text-sky-700 dark:text-sky-300" onClick={onAskAi}><Sparkles className="me-1 size-3.5" />{t('workflowBuilder.check.fixAi', 'Fix with AI')}</Button>}
    </li>
  );
}

/** Translation keys used here with dynamic parts (the i18n test checks them). */
export const CHECK_KEYS = [
  'ready', 'readyText', 'attention', 'attentionText', 'blocked', 'blockedText', 'withLead', 'withSample', 'statSteps', 'statProblems', 'statPaths', 'channels',
  'live', 'notLive', 'steps', 'okSteps', 'paths', 'pathN', 'morePaths', 'fewerPaths', 'rerun', 'fixAll', 'show', 'fixAi', 'dryOk', 'dryOkPort', 'dryFailedShort',
  'pathRepeats', 'pathStops', 'pathOpen', 'showPath', 'running', 'channelDown', 'dryFailed', 'fixDry', 'promptOne', 'promptAll', 'promptPath', 'tab', 'tabHint',
  'status.ok', 'status.warning', 'status.error', 'setupNote',
  ...['voice', 'sms', 'whatsapp', 'email'].flatMap((c) => [`channel.${c}`, `fixChannel.${c}`]),
  ...['not_enabled', 'not_configured', 'provider_down', 'check_failed', 'no_agent'].map((r) => `reason.${r}`),
].map((k) => `workflowBuilder.check.${k}`);
