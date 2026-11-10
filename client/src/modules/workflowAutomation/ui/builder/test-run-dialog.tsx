'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink, FlaskConical, Loader2, Rocket, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { workflowApi } from '../../services/workflow-api';
import { useLeadSearch, type LeadOption } from '../../hooks/use-lookups';
import { CATEGORY_STYLES, PORT_TONE_CLASSES, portTone, visualFor } from '../../lib/node-registry';
import { SelectField } from './form-controls';
import { OutcomeBadge } from '../shared/status-badge';
import type { EndOutcome, TestRunOptions, TestRunResult, WorkflowGraph } from '../../types/workflow-types';

interface Props {
  open: boolean; onOpenChange: (v: boolean) => void; workflowId: string; graph: WorkflowGraph; onResult: (r: TestRunResult | null) => void;
  /** "Test this step": dry-run only this step. */
  startNodeId?: string | null;
  /** Live test (real calls/messages) needs a published workflow and workflow:execute. */
  canLiveTest?: boolean;
  publishedVersion?: number | null;
  dirty?: boolean;
}

export function TestRunDialog({ open, onOpenChange, workflowId, graph, onResult, startNodeId = null, canLiveTest = false, publishedVersion = null, dirty = false }: Props) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lead, setLead] = useState<LeadOption | null>(null);
  const [options, setOptions] = useState<TestRunOptions>({ callOutcome: 'answered', analysis: 'qualified', messageOutcome: 'sent', eventOutcome: 'matched' });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [mode, setMode] = useState<'dry' | 'live'>('dry');
  const [confirmLive, setConfirmLive] = useState(false);
  const [liveCampaign, setLiveCampaign] = useState<string | null>(null);
  useEffect(() => { const id = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(id); }, [q]);
  const { data: leads = [], isFetching } = useLeadSearch(debounced, open);
  const types = new Set(graph.nodes.map((n) => n.type));

  const run = async () => {
    if (!lead) return;
    setRunning(true);
    try {
      const r = await workflowApi.test(workflowId, { leadId: lead._id, graph, options: { ...options, ...(startNodeId ? { startNodeId, singleStep: true } : {}) } });
      setResult(r); if (!startNodeId) onResult(r);
    } catch (e) { showError(e); } finally { setRunning(false); }
  };

  const runLive = async () => {
    if (!lead || !confirmLive) return;
    setRunning(true);
    try {
      const c = await workflowApi.createCampaign({ name: `Live test · ${lead.name || lead.leadNumber || ''}`.slice(0, 160), workflowId, selection: { mode: 'explicit', leadIds: [lead._id] } });
      await workflowApi.campaignAction(c._id, 'start');
      setLiveCampaign(c._id);
    } catch (e) { showError(e); } finally { setRunning(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setResult(null); setLiveCampaign(null); setConfirmLive(false); setMode('dry'); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="size-5 text-primary" />{startNodeId ? t('workflowBuilder.test.stepTitle', 'Test this step') : t('workflowBuilder.test.title', 'Test workflow')}</DialogTitle>
          <DialogDescription>{startNodeId ? t('workflowBuilder.test.stepDescription', 'Simulates only this step for a real lead — nothing is called, sent or changed.') : t('workflowBuilder.test.description', 'A safe simulation on a real lead: conditions read the lead’s real data, but nothing is called, sent or changed.')}</DialogDescription>
        </DialogHeader>
        {!startNodeId && (
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist">
            {(['dry', 'live'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} disabled={m === 'live' && !canLiveTest}
                className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40', mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                {m === 'dry' ? t('workflowBuilder.test.modeDry', 'Simulation (safe)') : t('workflowBuilder.test.modeLive', 'Live test (real actions)')}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold">{t('workflowBuilder.test.lead', 'Sample lead')}</p>
            <div className="relative">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="ps-8 text-sm" placeholder={t('workflowBuilder.test.searchLead', 'Search leads by name, number, phone…')} />
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border p-1" role="listbox" aria-label={t('workflowBuilder.test.lead', 'Sample lead')}>
              {isFetching && !leads.length && <li className="flex justify-center py-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></li>}
              {leads.map((l) => (
                <li key={l._id}>
                  <button type="button" role="option" aria-selected={lead?._id === l._id} onClick={() => setLead(l)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors', lead?._id === l._id ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}>
                    <span className="min-w-0 truncate font-medium">{l.name || l.leadNumber}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{l.leadNumber} · {t(`leads.status.${l.status}`, l.status || '')}</span>
                  </button>
                </li>
              ))}
              {!isFetching && !leads.length && <li className="py-6 text-center text-xs text-muted-foreground">{t('workflowBuilder.test.noLeads', 'No leads found')}</li>}
            </ul>
          </div>
          {mode === 'live' ? (
            <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <p className="flex items-start gap-1.5 font-semibold text-amber-900 dark:text-amber-100"><AlertTriangle className="mt-px size-3.5 shrink-0" />{t('workflowBuilder.test.liveWarning', 'This runs the PUBLISHED version for the selected lead: real calls, messages and CRM changes happen.')}</p>
              {publishedVersion ? <p>{t('workflowBuilder.test.liveVersion', 'Version used: v{version}', { version: publishedVersion })}{dirty ? ` — ${t('workflowBuilder.test.liveDirty', 'your unsaved/unpublished changes are NOT included')}` : ''}</p>
                : <p className="text-rose-700 dark:text-rose-300">{t('workflowBuilder.test.liveNeedsPublish', 'Publish the workflow first.')}</p>}
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={confirmLive} onChange={(e) => setConfirmLive(e.target.checked)} />{t('workflowBuilder.test.liveConfirm', 'I understand that this contacts the lead for real.')}</label>
              {liveCampaign && (
                <Link href={`/automation/campaigns/${liveCampaign}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">{t('workflowBuilder.test.liveStarted', 'Started — follow the execution')}<ExternalLink className="size-3" /></Link>
              )}
            </div>
          ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold">{t('workflowBuilder.test.simulate', 'Simulate outcomes')}</p>
            {(types.has('ai.call')) && <SelectField label={t('workflowBuilder.test.callOutcome', 'AI call result')} value={options.callOutcome} onChange={(v) => setOptions({ ...options, callOutcome: (v || 'answered') as TestRunOptions['callOutcome'] })}
              options={['answered', 'unanswered', 'failed', 'blocked'].map((p) => ({ value: p, label: t(`workflow.port.${p}`, p) }))} />}
            {types.has('ai.analyze') && <SelectField label={t('workflowBuilder.test.analysis', 'Analysis result')} value={options.analysis} onChange={(v) => setOptions({ ...options, analysis: (v || 'qualified') as TestRunOptions['analysis'] })}
              options={['qualified', 'not_qualified', 'callback', 'unknown'].map((p) => ({ value: p, label: t(`workflow.port.${p}`, p) }))} />}
            {[...types].some((x) => x.startsWith('msg.')) && <SelectField label={t('workflowBuilder.test.messageOutcome', 'Message result')} value={options.messageOutcome} onChange={(v) => setOptions({ ...options, messageOutcome: (v || 'sent') as TestRunOptions['messageOutcome'] })}
              options={['sent', 'blocked'].map((p) => ({ value: p, label: t(`workflow.port.${p}`, p) }))} />}
            {types.has('logic.wait_event') && <SelectField label={t('workflowBuilder.test.eventOutcome', 'Awaited event')} value={options.eventOutcome} onChange={(v) => setOptions({ ...options, eventOutcome: (v || 'matched') as TestRunOptions['eventOutcome'] })}
              options={['matched', 'timeout'].map((p) => ({ value: p, label: t(`workflow.port.${p}`, p) }))} />}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-500" />{t('workflowBuilder.test.safe', 'No calls, messages, tasks or CRM changes are made.')}</p>
          </div>
          )}
        </div>

        {result && (
          <div className="space-y-3 rounded-2xl border bg-muted/20 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t('workflowBuilder.test.path', 'Path for {lead}', { lead: result.lead.name })}</p>
              {result.outcome && (['loop_limit', 'failed', 'skipped'].includes(result.outcome)
                ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700">{t(`workflowBuilder.test.outcome.${result.outcome}`, result.outcome)}</span>
                : <OutcomeBadge outcome={result.outcome as EndOutcome} />)}
            </div>
            {!result.valid && <p className="text-xs text-amber-700 dark:text-amber-300">{t('workflowBuilder.test.invalidNote', 'The draft still has validation errors — fix them before publishing.')}</p>}
            <ol className="relative space-y-2 border-s ps-5">
              {result.steps.map((s, i) => {
                const v = visualFor(s.type); const Icon = v.icon;
                return (
                  <li key={`${s.nodeId}-${i}`} className="relative">
                    <span className={cn('absolute -start-[29px] top-0.5 grid size-5 place-items-center rounded-full ring-4 ring-background', CATEGORY_STYLES[v.category].icon)}><Icon className="size-3" /></span>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{s.label || t(`workflow.node.${s.type}.label`, s.type)}</span>
                      {s.port && <span className={cn('rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold ring-1 ring-border', PORT_TONE_CLASSES[portTone(s.port)].split(' ').slice(1).join(' '))}>→ {t(`workflow.port.${s.port}`, s.port)}</span>}
                      {s.status !== 'completed' && <span className="text-xs text-rose-600">{s.error?.message}</span>}
                    </div>
                    {Array.isArray((s.output as { trace?: unknown[] })?.trace) && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {((s.output as { trace: Array<{ field: string; operator: string; value: unknown; actual: unknown; result: boolean }> }).trace).map((tr, j) => (
                          <li key={j} className="font-mono">{tr.result ? '✓' : '✗'} {tr.field} {t(`workflowBuilder.operator.${tr.operator}`, tr.operator)} {tr.value == null ? '' : String(tr.value)} <span className="opacity-70">({t('workflowBuilder.test.actual', 'actual')}: {tr.actual == null ? '∅' : String(tr.actual)})</span></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('workflowBuilder.common.close', 'Close')}</Button>
          {mode === 'live'
            ? <Button onClick={runLive} disabled={!lead || running || !confirmLive || !publishedVersion || Boolean(liveCampaign)} className="bg-amber-600 hover:bg-amber-700">{running ? <Loader2 className="me-1.5 size-4 animate-spin" /> : <Rocket className="me-1.5 size-4" />}{t('workflowBuilder.test.runLive', 'Start live test')}</Button>
            : <Button onClick={run} disabled={!lead || running}>{running ? <Loader2 className="me-1.5 size-4 animate-spin" /> : <FlaskConical className="me-1.5 size-4" />}{startNodeId ? t('workflowBuilder.test.runStep', 'Test step') : t('workflowBuilder.test.run', 'Run test')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
