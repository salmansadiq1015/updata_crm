'use client';
import '@xyflow/react/dist/style.css';
import '../shared/workflow-canvas.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { Check, ChevronLeft, ChevronRight, CircleCheck, Lightbulb, Mail, Pause, PhoneCall, PhoneMissed, Play, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useWorkflowCatalog } from '../../hooks/use-workflows';
import { CATEGORY_STYLES, visualFor } from '../../lib/node-registry';
import { autoLayout, NODE_HEIGHT, NODE_WIDTH, outputsFromCatalog, toFlow } from '../../lib/graph-utils';
import { WorkflowNodeCard } from '../shared/workflow-node-card';
import { WorkflowEdge as WorkflowEdgeView } from '../shared/workflow-edge';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '../../types/workflow-types';

/**
 * Interactive demo: building blocks fly onto a canvas and link up step by step, with an explanation
 * and a "do it right" tip per step. Plays by itself, or the user clicks the highlighted block to add it.
 * Uses the real node cards and layout, so it looks exactly like the builder. Never touches the user's canvas
 * unless they choose "Use as my starting point" (empty canvas only).
 */
const n = (id: string, type: string, label: string, config: Record<string, unknown> = {}): WorkflowNode => ({ id, type, position: { x: 0, y: 0 }, data: { label, config } });
const e = (source: string, port: string, target: string): WorkflowEdge => ({ id: `${source}-${port}-${target}`, source, sourceHandle: port, target });

interface DemoStep { id: string; add?: WorkflowNode[]; connect?: WorkflowEdge[]; title: string; text: string; tip: string }
export interface DemoScenario { id: string; icon: typeof PhoneCall; title: string; prompt: string; steps: DemoStep[] }

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'qualify', icon: PhoneCall, title: 'AI lead qualification',
    prompt: 'Create an AI lead qualification workflow for new leads: call them with my AI agent, analyse the answers, notify the assigned rep for qualified leads, schedule a callback when requested and end every branch correctly.',
    steps: [
      { id: 'trigger', add: [n('t', 'trigger.lead_created', 'New lead')], title: 'Choose what starts it', text: 'Every workflow has exactly one trigger. Here it starts for every new lead.', tip: 'Use “Campaign start” instead when you want to run it for a list you pick.' },
      { id: 'call', add: [n('call', 'ai.call', 'Qualification call', { maxAttempts: 3 })], connect: [e('t', 'out', 'call')], title: 'Let the AI agent call', text: 'The AI call dials the lead with your agent and waits for the result. It retries by itself up to “Max. attempts”.', tip: 'Choose an active agent and keep attempts low (2–3).' },
      { id: 'analyze', add: [n('analyze', 'ai.analyze', 'Analyse answers')], connect: [e('call', 'answered', 'analyze')], title: 'Understand the answers', text: 'Analyse turns the conversation into a decision: qualified, not qualified, callback or unclear.', tip: 'Never treat “unclear” as qualified — give it its own path.' },
      { id: 'notify', add: [n('notify', 'notify.user', 'Alert the rep', { recipients: 'assigned', title: 'Qualified lead', message: '{{lead.name}} is qualified — call back today.' }), n('endQ', 'end', 'Qualified', { outcome: 'qualified' })], connect: [e('analyze', 'qualified', 'notify'), e('notify', 'out', 'endQ')], title: 'Act on good leads', text: 'Qualified leads alert the assigned rep and finish with the outcome “Qualified”.', tip: 'Finish every path with an End step so the result is counted.' },
      { id: 'callback', add: [n('cb', 'ai.callback', 'Schedule callback'), n('endC', 'end', 'Callback scheduled', { outcome: 'callback_scheduled' })], connect: [e('analyze', 'callback', 'cb'), e('cb', 'out', 'endC'), e('cb', 'failed', 'endC')], title: 'Honour callback requests', text: 'If the lead asks to be called later, a callback is scheduled at the requested time.', tip: 'Callbacks respect calling hours automatically.' },
      { id: 'close', add: [n('endN', 'end', 'Not interested', { outcome: 'not_qualified' }), n('endR', 'end', 'Needs review', { outcome: 'follow_up_required' }), n('endU', 'end', 'Unreachable', { outcome: 'unreachable' })], connect: [e('analyze', 'not_qualified', 'endN'), e('analyze', 'unknown', 'endR'), e('call', 'unanswered', 'endU'), e('call', 'failed', 'endU'), e('call', 'blocked', 'endU')], title: 'Close every branch', text: 'Not interested, unclear and unreachable leads each end with their own outcome, so reports stay correct.', tip: 'Open branches are flagged under “Check”.' },
      { id: 'publish', title: 'Check, test, publish', text: 'Run Check until it shows no problems, test with a sample lead (nothing is sent), then publish.', tip: 'Publishing starts real calls — always test first.' },
    ],
  },
  {
    id: 'missed', icon: PhoneMissed, title: 'Missed call → SMS',
    prompt: 'When an incoming call is missed, send the lead an SMS, wait 24 hours for a reply, notify the assigned rep when they reply and create a follow-up task when they do not. End every branch correctly.',
    steps: [
      { id: 'trigger', add: [n('t', 'trigger.inbound_call', 'Missed call', { outcome: 'missed' })], title: 'React to a missed call', text: 'The trigger fires when an incoming call was missed.', tip: 'Filter the trigger so only missed calls start it.' },
      { id: 'sms', add: [n('sms', 'msg.sms', 'Sorry we missed you', { body: 'Sorry we missed your call — reply here or we call you back.', purpose: 'transactional' })], connect: [e('t', 'out', 'sms')], title: 'Send an SMS right away', text: 'A short, personal SMS goes out. Consent and opt-outs are checked right before sending.', tip: 'Use “transactional” only for genuine service messages.' },
      { id: 'wait', add: [n('wait', 'logic.wait_event', 'Wait for a reply', { events: ['message.replied'], timeoutHours: 24 })], connect: [e('sms', 'sent', 'wait')], title: 'Wait for the answer', text: 'The workflow pauses until the lead replies — or 24 hours pass.', tip: 'Always set a timeout so nobody waits forever.' },
      { id: 'reply', add: [n('notify', 'notify.user', 'Lead replied', { recipients: 'assigned', title: 'Missed caller replied', message: '{{lead.name}} answered the SMS.' }), n('endI', 'end', 'Interested', { outcome: 'interested' })], connect: [e('wait', 'matched', 'notify'), e('notify', 'out', 'endI')], title: 'A reply alerts sales', text: 'When the lead replies, the assigned rep is notified immediately.', tip: 'Notifications go to real users — pick who should act.' },
      { id: 'timeout', add: [n('task', 'task.create', 'Call back manually', { title: 'Call back missed caller', dueInHours: 4 }), n('endF', 'end', 'Follow-up needed', { outcome: 'follow_up_required' })], connect: [e('wait', 'timeout', 'task'), e('task', 'out', 'endF')], title: 'No reply? Create a task', text: 'After 24 hours without a reply, a person gets a task to call back.', tip: 'Give tasks a due date so they show up in time.' },
      { id: 'blocked', add: [n('endO', 'end', 'Opted out', { outcome: 'opted_out', updateLeadStatus: false })], connect: [e('sms', 'blocked', 'endO'), e('sms', 'failed', 'endF')], title: 'Respect opt-outs', text: 'If the lead cannot be messaged (no consent, opted out), the branch ends cleanly.', tip: 'Never route a blocked message to another channel without consent.' },
      { id: 'publish', title: 'Check, test, publish', text: 'Run Check, test with a sample lead, then publish.', tip: 'Publishing starts real messages — always test first.' },
    ],
  },
  {
    id: 'nurture', icon: Mail, title: 'Email → call when opened',
    prompt: 'For imported leads, send a follow-up email with open tracking, wait up to 3 days for it to be opened, call the leads who opened it with my AI agent and tag the others as cold. End every branch correctly.',
    steps: [
      { id: 'trigger', add: [n('t', 'trigger.leads_imported', 'Leads imported')], title: 'Start with an import', text: 'Every lead from a contact list upload enters the workflow.', tip: 'Imported leads also count as “new lead” workflows.' },
      { id: 'email', add: [n('mail', 'msg.email', 'Follow-up email', { subject: 'Thanks for your interest', body: 'Hi {{firstName}}, thanks for your interest — here is what we can do for you.', purpose: 'transactional', trackOpens: true })], connect: [e('t', 'out', 'mail')], title: 'Send a tracked email', text: 'The email includes open tracking, so the workflow knows when it is read.', tip: 'Opens are a signal, not proof — some mail apps preload images.' },
      { id: 'wait', add: [n('wait', 'logic.wait_event', 'Wait until opened', { events: ['message.opened'], timeoutHours: 72 })], connect: [e('mail', 'sent', 'wait')], title: 'Wait for the open', text: 'The workflow waits up to 3 days for the email to be opened.', tip: 'Match the timeout to how fast your leads usually react.' },
      { id: 'call', add: [n('call', 'ai.call', 'Call while interested', { maxAttempts: 2 }), n('endI', 'end', 'Interested', { outcome: 'interested' })], connect: [e('wait', 'matched', 'call'), e('call', 'answered', 'endI')], title: 'Call warm leads', text: 'Leads who opened the email get an AI call while they are still interested.', tip: 'Calls only happen inside calling hours.' },
      { id: 'cold', add: [n('tag', 'crm.add_tags', 'Tag as cold', { add: ['cold'] }), n('endC', 'end', 'Completed', { outcome: 'completed' })], connect: [e('wait', 'timeout', 'tag'), e('tag', 'out', 'endC')], title: 'Tag the rest', text: 'Leads who did not open the email are tagged “cold” for a later campaign.', tip: 'Tags make it easy to target these leads again.' },
      { id: 'close', add: [n('endU', 'end', 'Unreachable', { outcome: 'unreachable' })], connect: [e('call', 'unanswered', 'endU'), e('call', 'failed', 'endU'), e('call', 'blocked', 'endU'), e('mail', 'blocked', 'endC'), e('mail', 'failed', 'endC')], title: 'Close every branch', text: 'Unreachable leads and emails that could not be sent each end cleanly.', tip: 'Every branch ends — Check confirms it.' },
      { id: 'publish', title: 'Check, test, publish', text: 'Run Check, test with a sample lead, then publish.', tip: 'Publishing sends real emails and calls — test first.' },
    ],
  },
];

export const demoGraph = (s: DemoScenario): WorkflowGraph => ({ nodes: s.steps.flatMap((st) => st.add || []), edges: s.steps.flatMap((st) => st.connect || []) });
const CHECKLIST = ['trigger', 'resources', 'branches', 'ends', 'test', 'publish'] as const;
const STEP_MS = 3600;
const nodeTypesFor = (types: string[]) => Object.fromEntries(types.map((ty) => [ty, WorkflowNodeCard]));
const edgeTypes = { workflow: WorkflowEdgeView };

function DemoCanvas({ scenario, step }: { scenario: DemoScenario; step: number }) {
  const { data: catalog } = useWorkflowCatalog();
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow();
  const outputs = useMemo(() => outputsFromCatalog(catalog), [catalog]);
  const nodeTypes = useMemo(() => nodeTypesFor((catalog?.nodes || []).map((x) => x.type)), [catalog]);
  const layout = useMemo(() => autoLayout(demoGraph(scenario), outputs, { colGap: 56, rowGap: 72 }), [scenario, outputs]);
  const pos = useMemo(() => new Map(layout.nodes.map((x) => [x.id, x.position])), [layout]);
  const bounds = useMemo(() => {
    const xs = layout.nodes.map((x) => x.position.x); const ys = layout.nodes.map((x) => x.position.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + NODE_WIDTH, height: Math.max(...ys) - Math.min(...ys) + NODE_HEIGHT };
  }, [layout]);

  // Arrival choreography: new nodes start off-canvas (left), glide in, then their links draw.
  const current = scenario.steps[step];
  const stepKey = `${scenario.id}:${step}`;
  const [stage, setStage] = useState<{ key: string; phase: 'spawn' | 'move' | 'link' }>({ key: '', phase: 'link' });
  const phase = stage.key === stepKey ? stage.phase : (current?.add?.length ? 'spawn' : 'link');
  useEffect(() => {
    if (!current?.add?.length) return undefined;
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setStage({ key: stepKey, phase: 'move' })));
    const b = setTimeout(() => setStage({ key: stepKey, phase: 'link' }), 750);
    return () => { cancelAnimationFrame(a); clearTimeout(b); };
  }, [stepKey, current]);

  useEffect(() => {
    if (!catalog) return undefined;
    // Re-fit per step: the caption below grows on the last step and the canvas gets shorter.
    const id = requestAnimationFrame(() => flow.fitBounds(bounds, { padding: 0.1, duration: step ? 250 : 0 }));
    return () => cancelAnimationFrame(id);
  }, [catalog, bounds, flow, scenario.id, step]);

  const { nodes, edges } = useMemo(() => {
    const shown = scenario.steps.slice(0, step + 1);
    const graph: WorkflowGraph = { nodes: shown.flatMap((st) => st.add || []), edges: shown.flatMap((st) => st.connect || []) };
    const fresh = new Set((current?.add || []).map((x) => x.id));
    const freshEdges = new Set((current?.connect || []).map((x) => x.id));
    const f = toFlow(graph, outputs, (node) => ({ readOnly: true, aiFlash: fresh.has(node.id) && phase === 'link' }));
    return {
      nodes: f.nodes.map((node) => {
        const target = pos.get(node.id) || node.position;
        const spawning = fresh.has(node.id) && phase === 'spawn';
        return { ...node, position: spawning ? { x: bounds.x - NODE_WIDTH - 160, y: target.y } : target, draggable: false, connectable: false, selectable: false, className: cn('wf-demo-node', spawning && 'wf-demo-spawn') };
      }),
      edges: f.edges
        .filter((edge) => !freshEdges.has(edge.id) || phase === 'link')
        .map((edge) => ({ ...edge, selectable: false, className: freshEdges.has(edge.id) ? 'wf-demo-edge-new' : undefined, data: { ...edge.data!, active: freshEdges.has(edge.id) } })),
    };
  }, [scenario, step, current, outputs, pos, phase, bounds.x]);

  if (!catalog) return <div className="h-full animate-pulse bg-muted/30" />;
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
      minZoom={0.15} maxZoom={1.2} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} panOnDrag={false} zoomOnScroll={false}
      zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} className="!text-slate-300 dark:!text-slate-700" color="currentColor" />
    </ReactFlow>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasEmpty: boolean;
  onBuildWithAi: (prompt: string) => void;
  onUseGraph: (graph: WorkflowGraph) => void;
}

export function WorkflowDemoDialog({ open, onOpenChange, canvasEmpty, onBuildWithAi, onUseGraph }: Props) {
  const { t } = useLanguage();
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [step, setStep] = useState(0);
  const [playingRaw, setPlaying] = useState(true);
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId) || DEMO_SCENARIOS[0];
  const last = scenario.steps.length - 1;
  const st = scenario.steps[step];
  const playing = playingRaw && step < last;
  const tx = (stepId: string, field: 'title' | 'text' | 'tip', fallback: string) => t(`workflowDemo.${scenario.id}.${stepId}.${field}`, fallback);
  const go = (i: number) => setStep(Math.max(0, Math.min(last, i)));
  const pick = (id: string) => { setScenarioId(id); setStep(0); setPlaying(true); };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !playing || step >= last) return undefined;
    timer.current = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, playing, step, last]);
  const reset = () => { setStep(0); setPlaying(true); };

  // Palette: one entry per block type in order; the next one to add pulses and can be clicked.
  const seen = new Map<string, number>();
  scenario.steps.forEach((s, i) => (s.add || []).forEach((node) => { if (!seen.has(node.type)) seen.set(node.type, i); }));
  const blocks = [...seen.entries()].map(([type, firstStep]) => ({ type, firstStep }));
  const nextStepWithBlock = scenario.steps.findIndex((s, i) => i > step && (s.add?.length || 0) > 0);

  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); setPlaying(false); go(step + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); setPlaying(false); go(step - 1); }
    else if (ev.key === ' ' && (ev.target as HTMLElement).tagName !== 'BUTTON') { ev.preventDefault(); setPlaying((p) => !p); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setPlaying(false); } else reset(); }}>
      <DialogContent className="flex h-[min(860px,92vh)] w-[min(1240px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none" onKeyDown={onKey}>
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5 pe-16">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-sm"><Play className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">{t('workflowDemo.title', 'How to build a workflow')}</DialogTitle>
            <DialogDescription className="text-xs">{t('workflowDemo.subtitle', 'Watch the blocks connect — or click the glowing block to add it yourself.')}</DialogDescription>
          </div>
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label={t('workflowDemo.scenarios', 'Examples')}>
            {DEMO_SCENARIOS.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === scenario.id} onClick={() => pick(s.id)}
                  className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors', s.id === scenario.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  <Icon className="size-3.5" />{t(`workflowDemo.${s.id}.title`, s.title)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
          <aside className="hidden flex-col gap-1.5 overflow-y-auto border-e bg-card/50 p-3 md:flex" aria-label={t('workflowDemo.blocks', 'Blocks used')}>
            <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{t('workflowDemo.blocks', 'Blocks used')}</p>
            {blocks.map(({ type, firstStep }) => {
              const v = visualFor(type); const Icon = v.icon;
              const added = firstStep <= step;
              const isNext = firstStep === nextStepWithBlock && !playing;
              return (
                <button key={type} type="button" disabled={!isNext} onClick={() => go(firstStep)}
                  className={cn('relative flex items-center gap-2 rounded-xl border px-2 py-1.5 text-start text-xs transition-all',
                    added ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'bg-background',
                    isNext && 'wf-demo-next border-sky-500/60 shadow-[0_0_0_3px_rgb(14_165_233/0.18)]')}>
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', CATEGORY_STYLES[v.category].icon)}><Icon className="size-3.5" /></span>
                  <span className="min-w-0 flex-1 leading-tight">{t(`workflow.node.${type}.label`, type)}</span>
                  {added && <Check className="size-3.5 shrink-0 text-emerald-500" aria-label={t('workflowDemo.added', 'added')} />}
                </button>
              );
            })}
            {!playing && nextStepWithBlock > 0 && <p className="mt-1 px-1 text-[11px] text-sky-700 dark:text-sky-300">{t('workflowDemo.clickHint', 'Click the glowing block to add it.')}</p>}
          </aside>

          <div className="flex min-h-0 flex-col">
            <div className="wf-canvas wf-demo relative min-h-0 flex-1 bg-muted/30 dark:bg-slate-950/40">
              <ReactFlowProvider><DemoCanvas scenario={scenario} step={step} /></ReactFlowProvider>
            </div>
            <div className="min-h-[132px] border-t bg-card/80 px-5 py-4">
              <div key={`${scenario.id}-${step}`} className="wf-tl-in mx-auto w-full max-w-3xl" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-700 tabular-nums dark:text-sky-300">{step + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tx(st.id, 'title', st.title)}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{tx(st.id, 'text', st.text)}</p>
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                    <Lightbulb className="mt-px size-3.5 shrink-0" aria-hidden /><span><span className="font-semibold">{t('workflowDemo.tip', 'Do it right:')}</span> {tx(st.id, 'tip', st.tip)}</span>
                  </p>
                  {step === last && (
                    <ul className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label={t('workflowDemo.checklistTitle', 'Before you publish')}>
                      {CHECKLIST.map((k, i) => (
                        <li key={k} className="wf-tl-in flex items-start gap-1.5 text-xs" style={{ animationDelay: `${i * 90}ms` }}>
                          <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-500" aria-hidden />{t(`workflowDemo.checklist.${k}`, k)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={reset} aria-label={t('workflowDemo.restart', 'Restart')}><RotateCcw className="size-4" /></Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" disabled={step === 0} onClick={() => { setPlaying(false); go(step - 1); }} aria-label={t('workflowDemo.prev', 'Previous step')}><ChevronLeft className="size-4" /></Button>
            <Button type="button" size="icon" className="size-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white hover:from-sky-600 hover:to-cyan-600" disabled={step >= last && !playing}
              onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('workflowDemo.pause', 'Pause') : t('workflowDemo.play', 'Play')}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-8" disabled={step >= last} onClick={() => { setPlaying(false); go(step + 1); }} aria-label={t('workflowDemo.next', 'Next step')}><ChevronRight className="size-4" /></Button>
          </div>
          <div className="flex min-w-[140px] flex-1 items-center gap-1" aria-label={t('workflowDemo.progress', 'Step {step} of {total}', { step: step + 1, total: last + 1 })} role="img">
            {scenario.steps.map((s, i) => (
              <button key={s.id} type="button" onClick={() => { setPlaying(false); go(i); }} aria-label={tx(s.id, 'title', s.title)}
                className="group relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn('absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-sky-500 to-cyan-400', i < step ? 'w-full' : i === step ? (playing ? 'wf-demo-progress' : 'w-full') : 'w-0')}
                  style={i === step && playing ? { animationDuration: `${STEP_MS}ms` } : undefined} />
              </button>
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{t('workflowDemo.progress', 'Step {step} of {total}', { step: step + 1, total: last + 1 })}</span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {canvasEmpty && (
              <Button type="button" variant="outline" size="sm" onClick={() => { onUseGraph(demoGraph(scenario)); onOpenChange(false); }}>
                <Wand2 className="me-1.5 size-3.5" />{t('workflowDemo.useGraph', 'Use as my starting point')}
              </Button>
            )}
            <Button type="button" size="sm" className="bg-gradient-to-r from-sky-600 to-cyan-500 text-white hover:from-sky-700 hover:to-cyan-600"
              onClick={() => { onBuildWithAi(t(`workflowDemo.${scenario.id}.prompt`, scenario.prompt)); onOpenChange(false); }}>
              <Sparkles className="me-1.5 size-3.5" />{t('workflowDemo.buildWithAi', 'Build this with AI')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Every translation key the demo uses (the i18n test checks them). */
export const DEMO_KEYS = [
  'workflowDemo.title', 'workflowDemo.subtitle', 'workflowDemo.scenarios', 'workflowDemo.blocks', 'workflowDemo.added', 'workflowDemo.clickHint', 'workflowDemo.tip',
  'workflowDemo.checklistTitle', 'workflowDemo.restart', 'workflowDemo.prev', 'workflowDemo.pause', 'workflowDemo.play', 'workflowDemo.next', 'workflowDemo.progress',
  'workflowDemo.useGraph', 'workflowDemo.buildWithAi', ...CHECKLIST.map((k) => `workflowDemo.checklist.${k}`),
  ...DEMO_SCENARIOS.flatMap((s) => [`workflowDemo.${s.id}.title`, `workflowDemo.${s.id}.prompt`, ...s.steps.flatMap((st) => ['title', 'text', 'tip'].map((f) => `workflowDemo.${s.id}.${st.id}.${f}`))]),
];
