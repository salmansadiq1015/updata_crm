'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCopy, ClipboardPaste, FileText, ListChecks, Sparkles, XCircle } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';
import type { Question, StatusRule } from '../types/ai-calling-types';
import { DEFAULT_PROMPT_PARAMS, EXAMPLE, FORMAT_GUIDE, buildAiPrompt, parseQuestionText, serializeQuestions, type PromptParams } from '../question-import';
import { AgentDialog, AgentField, AgentTabs, inputClass, primaryClass, secondaryClass } from './calling-agent-primitives';

const PARAMS_KEY = 'ai-calling:question-prompt-params';
const loadParams = (): PromptParams => {
  try { return { ...DEFAULT_PROMPT_PARAMS, ...JSON.parse(localStorage.getItem(PARAMS_KEY) || '{}') }; } catch { return DEFAULT_PROMPT_PARAMS; }
};
async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); showSuccess(`${what} copied`); }
  catch { showError(new Error('Copy failed. Select the text and copy it manually.')); }
}

export interface QuestionImportResult { questions: Question[]; rules: StatusRule[] | null }

export function QuestionImportDialog({ questions, rules, initialTab = 'paste', onApply, onClose }: {
  questions: Question[]; rules?: StatusRule[]; initialTab?: 'paste' | 'ai';
  onApply: (result: QuestionImportResult) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<string>(initialTab);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>(questions.length ? 'append' : 'replace');
  const [params, setParams] = useState(loadParams);
  const rulesSupported = rules !== undefined;
  const parsed = useMemo(() => parseQuestionText(text, { existing: questions, mode }), [text, questions, mode]);
  const prompt = useMemo(() => buildAiPrompt(params), [params]);
  const setParam = <K extends keyof PromptParams>(key: K, value: PromptParams[K]) => {
    const next = { ...params, [key]: value };
    setParams(next);
    try { localStorage.setItem(PARAMS_KEY, JSON.stringify(next)); } catch { /* per-browser convenience only */ }
  };

  const total = (mode === 'append' ? questions.length : 0) + parsed.questions.length;
  const canApply = parsed.questions.length > 0 && parsed.errors.length === 0;
  const apply = () => {
    const nextQuestions = (mode === 'append' ? [...questions, ...parsed.questions] : parsed.questions).map((q, i) => ({ ...q, order: i + 1 }));
    let nextRules: StatusRule[] | null = null;
    if (rulesSupported) {
      // Keep only existing rules whose fields still exist; pasted rules are added after them.
      const keys = new Set(nextQuestions.map(q => q.fieldKey));
      const kept = mode === 'append' || !parsed.rules.length ? (rules || []).filter(r => [...(r.when.all || []), ...(r.when.any || [])].every(c => keys.has(c.field))) : [];
      nextRules = [...kept, ...parsed.rules];
    }
    onApply({ questions: nextQuestions, rules: nextRules });
    showSuccess(`${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} ${mode === 'append' ? 'added' : 'imported'}${parsed.rules.length && rulesSupported ? ` with ${parsed.rules.length} rule${parsed.rules.length === 1 ? '' : 's'}` : ''}. Save to keep them.`);
    onClose();
  };

  const footer = tab === 'paste'
    ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{parsed.errors.length ? `Fix ${parsed.errors.length} problem${parsed.errors.length === 1 ? '' : 's'} to continue.` : parsed.questions.length ? `The agent will have ${total} question${total === 1 ? '' : 's'}. Nothing is saved until you save the agent.` : 'Paste your questions to see a preview.'}</p>
      <button type="button" className={primaryClass} disabled={!canApply} onClick={apply}><CheckCircle2 className="size-4" />{mode === 'append' ? `Add ${parsed.questions.length || ''} questions` : `Replace with ${parsed.questions.length || ''} questions`}</button>
    </div>
    : <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">Paste the prompt into any AI assistant, then paste its reply here.</p>
      <div className="flex gap-2"><button type="button" className={secondaryClass} onClick={() => void copy(prompt, 'Prompt')}><ClipboardCopy className="size-4" />Copy prompt</button><button type="button" className={primaryClass} onClick={() => setTab('paste')}>Paste the AI reply<ArrowRight className="size-4" /></button></div>
    </div>;

  return <AgentDialog wide title="Import questions" description="Paste a complete question list, or have any AI assistant write one for you in the format below." onClose={onClose} footer={footer}>
    <AgentTabs label="Import method" value={tab} onChange={setTab} items={[{ value: 'paste', label: 'Paste questions' }, { value: 'ai', label: 'Create with AI' }, { value: 'format', label: 'Format guide' }]}>
      {tab === 'paste' && <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondaryClass} onClick={() => setText(EXAMPLE)}><FileText className="size-4" />Load example</button>
            {questions.length > 0 && <button type="button" className={secondaryClass} onClick={() => void copy(serializeQuestions(questions, rules), 'Current questions')}><ClipboardCopy className="size-4" />Copy current questions</button>}
            {questions.length > 0 && <div role="radiogroup" aria-label="Import mode" className="ms-auto flex rounded-xl border border-border bg-muted/40 p-1 text-xs">
              {(['append', 'replace'] as const).map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 font-medium transition ${mode === m ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white' : 'text-muted-foreground hover:text-foreground'}`}>{m === 'append' ? `Add to ${questions.length} existing` : 'Replace all'}</button>)}
            </div>}
          </div>
          <textarea aria-label="Paste questions" spellCheck={false} rows={20} value={text} onChange={e => setText(e.target.value)} placeholder={`Paste your questions here, for example:\n\n${EXAMPLE.split('\n---\n').slice(0, 2).join('\n---\n')}`} className={`${inputClass} min-h-[420px] resize-y font-mono text-[13px] leading-relaxed`} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">Separate questions with a line of <code className="text-primary">---</code>, or start each one with <code className="text-primary">Q:</code> or a number. A simple numbered list of questions also works; types are guessed and shown in the preview.</p>
        </div>
        <ImportPreview parsed={parsed} empty={!text.trim()} rulesSupported={rulesSupported} />
      </div>}

      {tab === 'ai' && <div className="space-y-5">
        <div className="flex gap-3 rounded-2xl border border-sky-400/20 bg-gradient-to-r from-blue-600/15 via-transparent to-cyan-500/10 p-4">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <ol className="list-decimal space-y-1 ps-4 text-xs leading-relaxed text-muted-foreground"><li>Fill in the details below. The prompt updates as you type.</li><li>Copy the prompt and paste it into any AI assistant you use (ChatGPT, Claude, Gemini, Copilot…).</li><li>Copy the AI&apos;s reply and paste it into <strong>Paste questions</strong>. Check the preview, then apply.</li></ol>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AgentField label="Company name"><input className={inputClass} value={params.company} placeholder="Updata" onChange={e => setParam('company', e.target.value)} /></AgentField>
          <AgentField label="What you offer"><input className={inputClass} value={params.offering} placeholder="CRM software for small businesses" onChange={e => setParam('offering', e.target.value)} /></AgentField>
          <AgentField label="Goal of the call"><input className={inputClass} value={params.goal} onChange={e => setParam('goal', e.target.value)} /></AgentField>
          <AgentField label="Who you are calling"><input className={inputClass} value={params.audience} placeholder="Owners of retail shops in Lahore" onChange={e => setParam('audience', e.target.value)} /></AgentField>
          <AgentField label="Must collect" hint="Comma-separated, e.g. decision maker, budget, timeline"><input className={inputClass} value={params.mustCollect} onChange={e => setParam('mustCollect', e.target.value)} /></AgentField>
          <div className="grid grid-cols-2 gap-4">
            <AgentField label="Number of questions"><input type="number" min={1} max={40} className={inputClass} value={params.count} onChange={e => setParam('count', Number(e.target.value))} /></AgentField>
            <AgentField label="Language"><input className={inputClass} value={params.language} onChange={e => setParam('language', e.target.value)} /></AgentField>
          </div>
          <AgentField label="Tone"><input className={inputClass} value={params.tone} onChange={e => setParam('tone', e.target.value)} /></AgentField>
          <label className="flex items-center gap-2 self-end pb-3 text-xs text-muted-foreground"><input type="checkbox" checked={params.includeRules} onChange={e => setParam('includeRules', e.target.checked)} />Also suggest qualification rules{!rulesSupported && <span className="text-muted-foreground"> (not imported here)</span>}</label>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">Prompt to copy</p><button type="button" className={secondaryClass} onClick={() => void copy(prompt, 'Prompt')}><ClipboardCopy className="size-4" />Copy prompt</button></div>
          <textarea aria-label="Generated AI prompt" readOnly rows={14} value={prompt} onFocus={e => e.currentTarget.select()} className={`${inputClass} resize-y font-mono text-[12px] leading-relaxed text-muted-foreground`} />
        </div>
      </div>}

      {tab === 'format' && <div className="space-y-4 text-xs text-muted-foreground">
        <p className="text-muted-foreground">One block per question. Only <code className="text-primary">Q:</code> is required; everything else has a sensible default (Required: yes, Confirm: no, Type guessed from the question). Field names are case-insensitive.</p>
        <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[12px] leading-relaxed text-foreground">{FORMAT_GUIDE}</pre>
        <div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={() => void copy(FORMAT_GUIDE, 'Format')}><ClipboardCopy className="size-4" />Copy format</button><button type="button" className={secondaryClass} onClick={() => { setText(EXAMPLE); setTab('paste'); }}><ClipboardPaste className="size-4" />Try the example</button></div>
      </div>}
    </AgentTabs>
  </AgentDialog>;
}

function ImportPreview({ parsed, empty, rulesSupported }: { parsed: ReturnType<typeof parseQuestionText>; empty: boolean; rulesSupported: boolean }) {
  if (empty) return <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-6 text-center">
    <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/25 to-cyan-500/20 ring-1 ring-sky-400/20"><ListChecks className="size-5 text-primary" /></span>
    <p className="text-sm font-medium">Live preview</p><p className="max-w-xs text-xs text-muted-foreground">Each pasted question appears here with its type and settings, so you can check it before applying.</p>
  </div>;
  return <div aria-live="polite" className="min-w-0 space-y-3">
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-sky-400/10 px-2.5 py-1 font-medium text-primary">{parsed.questions.length} question{parsed.questions.length === 1 ? '' : 's'}</span>
      {parsed.rules.length > 0 && <span className="rounded-full bg-sky-400/10 px-2.5 py-1 font-medium text-primary">{parsed.rules.length} rule{parsed.rules.length === 1 ? '' : 's'}</span>}
      {parsed.errors.length > 0 && <span className="rounded-full bg-rose-500/15 px-2.5 py-1 font-medium text-rose-300">{parsed.errors.length} to fix</span>}
      {parsed.warnings.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">{parsed.warnings.length} note{parsed.warnings.length === 1 ? '' : 's'}</span>}
    </div>
    {parsed.errors.length > 0 && <ul role="alert" className="space-y-1.5 rounded-xl border border-rose-400/25 bg-rose-500/5 p-3 text-xs text-rose-200">{parsed.errors.map((e, i) => <li key={i} className="flex gap-2"><XCircle className="mt-0.5 size-3.5 shrink-0" />{e.message}</li>)}</ul>}
    {parsed.warnings.length > 0 && <details className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200"><summary className="flex cursor-pointer items-center gap-2"><AlertTriangle className="size-3.5" />{parsed.warnings.length} automatic choice{parsed.warnings.length === 1 ? '' : 's'} to review</summary><ul className="mt-2 space-y-1 ps-5 text-amber-200/80">{parsed.warnings.map((w, i) => <li key={i} className="list-disc">{w.message}</li>)}</ul></details>}
    <ol className="max-h-[440px] space-y-2 overflow-y-auto pe-1">{parsed.questions.map((q, i) => <li key={q.fieldKey} className="rounded-xl border border-border bg-white/[0.02] p-3">
      <div className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 text-[11px] font-semibold text-white">{i + 1}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{q.label}</p><p dir="auto" className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{q.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-primary">{q.type.replace(/_/g, ' ')}</span>
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground">{q.required ? 'Required' : 'Optional'}</span>
            {q.confirmCritical && <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground">Read back</span>}
            {q.options?.length ? <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground">{q.options.map(o => typeof o === 'string' ? o : o.value).join(' · ')}</span> : null}
            {q.condition && <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-300">Conditional</span>}
            <code className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground">{q.fieldKey}</code>
          </div>
        </div></div>
    </li>)}</ol>
    {parsed.rules.length > 0 && <div className="rounded-xl border border-border p-3 text-xs"><p className="mb-1.5 font-medium text-muted-foreground">Qualification rules{!rulesSupported && <span className="font-normal text-muted-foreground"> (add these on the rules tab)</span>}</p><ul className="space-y-1 text-muted-foreground">{parsed.rules.map(r => <li key={r.id}>{r.action.replace(/_/g, ' ')}{r.requiresReview ? ' · review' : ''}</li>)}</ul></div>}
  </div>;
}
