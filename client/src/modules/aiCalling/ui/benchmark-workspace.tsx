'use client';
import { useState } from 'react';
import { ArrowLeft, BadgeCheck, FlaskConical, GitCompare, Loader2, Pencil, Play, Plus, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useCallingAgents } from '../hooks/use-calling-agents';
import {
  useBenchmarkRun, useBenchmarkRuns, useBenchmarkSuite, useBenchmarkSuites, useQualityMutation, useRunComparison, useScriptVersions,
} from '../hooks/use-calling-quality';
import { callingQualityApi } from '../services/calling-quality-api';
import type {
  BenchmarkCase, BenchmarkCaseInput, BenchmarkCondition, BenchmarkLanguage, BenchmarkMetrics, BenchmarkQuestion, BenchmarkRun, BenchmarkSuite, BenchmarkTurn, ExpectedAnswer,
} from '../types/calling-quality-types';
import { AgentDialog, AgentField, AgentTabs, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { languageName, pct, when, type Translate } from './quality-format';

const LANGUAGES: BenchmarkLanguage[] = ['ur', 'en', 'mixed'];
const CONDITIONS: BenchmarkCondition[] = ['clean', 'noise', 'interruption'];
const QUESTION_TYPES = ['boolean', 'integer', 'decimal', 'currency', 'rating', 'single_choice', 'multiple_choice', 'email', 'phone', 'url', 'date', 'time', 'short_text', 'long_text', 'address'];
const chip = 'rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300';
const useT = () => (useLanguage() as { t: Translate }).t;

function useRoles() {
  const { isAdmin, hasPermission } = usePermissions();
  return {
    canWrite: isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission),
    canReview: isAdmin || ['ai-calling:admin', 'crm:admin'].some(hasPermission),
  };
}

export function BenchmarkWorkspace() {
  const t = useT();
  const [suiteId, setSuiteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const suites = useBenchmarkSuites();
  const { canWrite } = useRoles();
  const seed = useQualityMutation(() => callingQualityApi.seedSample());
  if (suiteId) return <SuiteDetail id={suiteId} onBack={() => setSuiteId(null)} />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">{t('aiBench.title')}</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">{t('aiBench.subtitle')}</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={secondaryClass} disabled={!canWrite || seed.isPending} onClick={async () => { const s = await seed.mutateAsync(undefined); setSuiteId(s._id); }}>{seed.isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}{t('aiBench.sample.create')}</button>
        <button className={primaryClass} disabled={!canWrite} onClick={() => setCreating(true)}><Plus className="size-4" />{t('aiBench.suite.new')}</button>
      </div>
    </div>
    {suites.isLoading && <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />{t('aiQuality.loading')}</p>}
    {suites.isError && <p role="alert" className="text-sm text-rose-300">{t('aiQuality.loadError')}</p>}
    {suites.data && !suites.data.length && <div className={`${panelClass} py-12 text-center`}><FlaskConical className="mx-auto size-8 text-sky-300/70" /><p className="mt-3 font-medium">{t('aiBench.empty.title')}</p><p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{t('aiBench.empty.body')}</p></div>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{suites.data?.map(s => <button key={s._id} type="button" onClick={() => setSuiteId(s._id)} className={`${panelClass} text-start transition hover:border-sky-400/30`}>
      <div className="flex items-start justify-between gap-2"><p className="font-semibold text-slate-100">{s.name}</p>{s.sample && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">{t('aiBench.sample.badge')}</span>}</div>
      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{s.description}</p>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-xs">
        <div><p className="text-slate-500">{t('aiBench.cases')}</p><p className="font-semibold text-slate-100">{s.cases ?? 0}</p></div>
        <div><p className="text-slate-500">{t('aiBench.reviewed')}</p><p className="font-semibold text-slate-100">{s.reviewedCases ?? 0}</p></div>
        <div><p className="text-slate-500">{t('aiBench.lastAccuracy')}</p><p className="font-semibold text-slate-100">{pct(s.lastRun?.metrics?.fieldAccuracy) ?? t('aiBench.noScore')}</p></div>
      </div>
    </button>)}</div>
    {creating && <SuiteDialog onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setSuiteId(id); }} />}
  </div>;
}

function QuestionRows({ questions, onChange }: { questions: BenchmarkQuestion[]; onChange: (q: BenchmarkQuestion[]) => void }) {
  const t = useT();
  const set = (i: number, patch: Partial<BenchmarkQuestion>) => onChange(questions.map((q, j) => j === i ? { ...q, ...patch } : q));
  return <div className="space-y-2">
    {questions.map((q, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
      <input aria-label={t('aiBench.q.fieldKey')} className={inputClass} placeholder={t('aiBench.q.fieldKey')} value={q.fieldKey} onChange={e => set(i, { fieldKey: e.target.value.replace(/[^\w.]/g, '') })} />
      <select aria-label={t('aiBench.q.type')} className={inputClass} value={q.type} onChange={e => set(i, { type: e.target.value })}>{QUESTION_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <input aria-label={t('aiBench.q.options')} className={inputClass} placeholder={t('aiBench.q.options')} value={(q.options || []).map(o => typeof o === 'string' ? o : o.value).join(', ')} onChange={e => set(i, { options: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
      <button type="button" aria-label={t('aiBench.remove')} className={secondaryClass} onClick={() => onChange(questions.filter((_, j) => j !== i))}><X className="size-4" /></button>
    </div>)}
    <button type="button" className={secondaryClass} onClick={() => onChange([...questions, { fieldKey: '', type: 'short_text', label: '', text: '' }])}><Plus className="size-4" />{t('aiBench.q.add')}</button>
  </div>;
}

function SuiteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([{ fieldKey: '', type: 'boolean' }]);
  const create = useQualityMutation(() => callingQualityApi.createSuite({ name, description, questionnaire: { questions: questions.filter(q => q.fieldKey).map(q => ({ ...q, label: q.label || q.fieldKey })) } }));
  return <AgentDialog title={t('aiBench.suite.new')} description={t('aiBench.suite.newHint')} onClose={onClose} wide
    footer={<div className="flex justify-end gap-2"><button className={secondaryClass} onClick={onClose}>{t('aiBench.cancel')}</button><button className={primaryClass} disabled={!name.trim() || create.isPending} onClick={async () => onCreated((await create.mutateAsync(undefined))._id)}>{t('aiBench.save')}</button></div>}>
    <div className="space-y-4">
      <AgentField label={t('aiBench.suite.name')}><input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></AgentField>
      <AgentField label={t('aiBench.suite.description')}><textarea className={inputClass} rows={2} value={description} onChange={e => setDescription(e.target.value)} /></AgentField>
      <AgentField label={t('aiBench.suite.questions')} hint={t('aiBench.suite.questionsHint')}><QuestionRows questions={questions} onChange={setQuestions} /></AgentField>
    </div>
  </AgentDialog>;
}

function SuiteDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useT();
  const suite = useBenchmarkSuite(id);
  const [tab, setTab] = useState('cases');
  const s = suite.data;
  if (!s) return <div className={panelClass}>{suite.isError ? <p role="alert" className="text-rose-300">{t('aiQuality.loadError')}</p> : <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" />{t('aiQuality.loading')}</p>}</div>;
  const reviewed = s.caseList?.filter(c => c.reviewed).length ?? 0;
  return <div className="space-y-5">
    <button className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100" onClick={onBack}><ArrowLeft className="size-3.5" />{t('aiBench.back')}</button>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold tracking-tight">{s.name}</h2><p className="mt-1 max-w-3xl text-xs text-slate-400">{s.description}</p>
        <p className="mt-2 text-xs text-slate-500">{t('aiBench.reviewedOf', { reviewed, total: s.caseList?.length ?? 0 })} · {t('aiBench.fieldsCount', { n: s.questionnaire.questions.length })}</p></div>
    </header>
    {s.sample && <div role="note" className="flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-4 text-xs text-amber-100"><ShieldAlert className="size-4 shrink-0 text-amber-300" />{t('aiBench.sample.notice')}</div>}
    <AgentTabs label={t('aiBench.suiteSections')} value={tab} onChange={setTab} items={[{ value: 'cases', label: t('aiBench.tab.cases') }, { value: 'runs', label: t('aiBench.tab.runs') }]}>
      {tab === 'cases' ? <CaseList suite={s} /> : <RunsPanel suite={s} />}
    </AgentTabs>
  </div>;
}

function ReviewBadge({ c }: { c: BenchmarkCase }) {
  const t = useT();
  return c.reviewed
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"><BadgeCheck className="size-3" />{t('aiBench.review.approvedOn', { date: c.reviewedAt ? new Date(c.reviewedAt).toLocaleDateString() : '' })}</span>
    : <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{t('aiBench.review.unreviewed')}</span>;
}

function CaseList({ suite }: { suite: BenchmarkSuite }) {
  const t = useT();
  const { canWrite, canReview } = useRoles();
  const [editing, setEditing] = useState<BenchmarkCase | 'new' | null>(null);
  const [reviewing, setReviewing] = useState<BenchmarkCase | null>(null);
  const remove = useQualityMutation((caseId: string) => callingQualityApi.removeCase(caseId));
  return <div className="space-y-3">
    <div className="flex justify-end"><button className={primaryClass} disabled={!canWrite} onClick={() => setEditing('new')}><Plus className="size-4" />{t('aiBench.case.new')}</button></div>
    {!suite.caseList?.length && <p className={`${panelClass} text-center text-xs text-slate-400`}>{t('aiBench.case.none')}</p>}
    <ul className="space-y-2">{suite.caseList?.map(c => <li key={c._id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1425] p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-100">{c.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={chip}>{languageName(t, c.language)}</span>
          {c.conditions.map(x => <span key={x} className={chip}>{t(`aiBench.condition.${x}`)}</span>)}
          {c.sample && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">{t('aiBench.sample.badge')}</span>}
          {c.audio?.fileId && <span className={chip}>{t('aiBench.case.hasAudio')}</span>}
          <ReviewBadge c={c} />
          <span className="text-[10px] text-slate-500">{t('aiBench.case.turns', { n: c.turns.length })} · {t('aiBench.case.expected', { n: c.groundTruth.answers.length })} · r{c.revision}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button className={secondaryClass} disabled={!canReview} onClick={() => setReviewing(c)}><BadgeCheck className="size-4" />{t('aiBench.review.open')}</button>
        <button className={secondaryClass} aria-label={t('aiBench.case.edit')} disabled={!canWrite} onClick={() => setEditing(c)}><Pencil className="size-4" /></button>
        <button className={secondaryClass} aria-label={t('aiBench.case.delete')} disabled={!canWrite || remove.isPending} onClick={() => { if (window.confirm(t('aiBench.case.deleteConfirm'))) remove.mutate(c._id); }}><Trash2 className="size-4" /></button>
      </div>
    </li>)}</ul>
    {editing && <CaseEditor suite={suite} current={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    {reviewing && <ReviewDialog suite={suite} c={reviewing} onClose={() => setReviewing(null)} />}
  </div>;
}

const display = (v: unknown) => v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
function parseExpected(q: BenchmarkQuestion | undefined, raw: string): unknown {
  const text = raw.trim();
  if (!q) return text;
  if (q.type === 'boolean') return text === 'true';
  if (['integer', 'decimal', 'currency', 'rating'].includes(q.type)) return Number(text);
  if (q.type === 'multiple_choice') return text.split(',').map(x => x.trim()).filter(Boolean);
  return text;
}

function CaseEditor({ suite, current, onClose }: { suite: BenchmarkSuite; current: BenchmarkCase | null; onClose: () => void }) {
  const t = useT();
  const questions = suite.questionnaire.questions;
  const [title, setTitle] = useState(current?.title || '');
  const [notes, setNotes] = useState(current?.notes || '');
  const [language, setLanguage] = useState<BenchmarkLanguage>(current?.language || 'en');
  const [conditions, setConditions] = useState<BenchmarkCondition[]>(current?.conditions?.length ? current.conditions : ['clean']);
  const [turns, setTurns] = useState<BenchmarkTurn[]>(current?.turns?.length ? current.turns : [{ speaker: 'agent', text: '' }, { speaker: 'lead', text: '' }]);
  const initial = Object.fromEntries((current?.groundTruth.answers || []).map(a => [a.fieldKey, a]));
  const [expected, setExpected] = useState<Record<string, { value: string; unknown: boolean }>>(Object.fromEntries(questions.map(q => [q.fieldKey, { value: display(initial[q.fieldKey]?.expected), unknown: Boolean(initial[q.fieldKey]?.expectUnknown) }])));
  const [items, setItems] = useState<Array<{ category: string; value: string }>>((current?.groundTruth.extraction || []).map(i => ({ category: i.category, value: display(i.value) })));
  const [audio, setAudio] = useState(current?.audio || null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useQualityMutation((input: BenchmarkCaseInput) => current ? callingQualityApi.updateCase(current._id, input) : callingQualityApi.createCase(suite._id, input));
  const setTurn = (i: number, patch: Partial<BenchmarkTurn>) => setTurns(turns.map((x, j) => j === i ? { ...x, ...patch } : x));
  const submit = async () => {
    setError(null);
    const answers: ExpectedAnswer[] = questions.flatMap((q): ExpectedAnswer[] => {
      const e = expected[q.fieldKey];
      if (e?.unknown) return [{ fieldKey: q.fieldKey, expectUnknown: true }];
      if (!e?.value.trim()) return [];
      return [{ fieldKey: q.fieldKey, expected: parseExpected(q, e.value) }];
    });
    const input: BenchmarkCaseInput = {
      title, notes, language, conditions,
      turns: turns.filter(x => x.text.trim() || x.speaker === 'lead').map(x => ({ ...x, fieldKey: x.fieldKey || null, startMs: x.startMs ?? null, endMs: x.endMs ?? null })),
      groundTruth: { answers, extraction: items.filter(i => i.category.trim()).map(i => ({ category: i.category.trim(), value: i.value })) },
      audio: audio ? { fileId: audio.fileId, mimeType: audio.mimeType || null, referenceTranscript: audio.referenceTranscript || '', sttLanguage: audio.sttLanguage || null } : null,
    };
    try { await save.mutateAsync(input); onClose(); } catch (e) { setError(readableError(e)); }
  };
  return <AgentDialog wide title={current ? t('aiBench.case.edit') : t('aiBench.case.new')} description={current?.reviewed ? t('aiBench.case.editWithdraws') : t('aiBench.case.editorHint')} onClose={onClose}
    footer={<div className="flex items-center justify-end gap-2">{error && <p role="alert" className="me-auto text-xs text-rose-300">{error}</p>}<button className={secondaryClass} onClick={onClose}>{t('aiBench.cancel')}</button><button className={primaryClass} disabled={!title.trim() || save.isPending} onClick={() => void submit()}>{t('aiBench.save')}</button></div>}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <AgentField label={t('aiBench.case.title')}><input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} /></AgentField>
        <AgentField label={t('aiBench.case.language')}><select className={inputClass} value={language} onChange={e => setLanguage(e.target.value as BenchmarkLanguage)}>{LANGUAGES.map(l => <option key={l} value={l}>{languageName(t, l)}</option>)}</select></AgentField>
      </div>
      <fieldset><legend className="mb-2 text-xs font-medium text-slate-300">{t('aiBench.case.conditions')}</legend><div className="flex flex-wrap gap-3">{CONDITIONS.map(c => <label key={c} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={conditions.includes(c)} onChange={e => setConditions(e.target.checked ? [...conditions, c] : conditions.filter(x => x !== c).length ? conditions.filter(x => x !== c) : conditions)} />{t(`aiBench.condition.${c}`)}</label>)}</div></fieldset>
      <AgentField label={t('aiBench.case.notes')}><textarea className={inputClass} rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></AgentField>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-300">{t('aiBench.case.transcript')}</p>
        <p className="mb-2 text-[11px] text-slate-500">{t('aiBench.case.transcriptHint')}</p>
        <div className="space-y-2">{turns.map((turn, i) => <div key={i} className="grid grid-cols-[110px_1fr_140px_70px_70px_auto] gap-2 max-md:grid-cols-2">
          <select aria-label={t('aiBench.case.speaker')} className={inputClass} value={turn.speaker} onChange={e => setTurn(i, { speaker: e.target.value as 'lead' | 'agent' })}><option value="agent">{t('aiBench.speaker.agent')}</option><option value="lead">{t('aiBench.speaker.lead')}</option></select>
          <input dir="auto" aria-label={t('aiBench.case.text')} className={inputClass} value={turn.text} onChange={e => setTurn(i, { text: e.target.value })} />
          <select aria-label={t('aiBench.case.field')} className={inputClass} value={turn.fieldKey || ''} onChange={e => setTurn(i, { fieldKey: e.target.value || null })}><option value="">{turn.speaker === 'agent' ? t('aiBench.case.asksNone') : t('aiBench.case.answersAuto')}</option>{questions.map(q => <option key={q.fieldKey} value={q.fieldKey}>{q.fieldKey}</option>)}</select>
          <input type="number" min={0} aria-label={t('aiBench.case.startMs')} placeholder="start ms" className={inputClass} value={turn.startMs ?? ''} onChange={e => setTurn(i, { startMs: e.target.value === '' ? null : Number(e.target.value) })} />
          <input type="number" min={0} aria-label={t('aiBench.case.endMs')} placeholder="end ms" className={inputClass} value={turn.endMs ?? ''} onChange={e => setTurn(i, { endMs: e.target.value === '' ? null : Number(e.target.value) })} />
          <button type="button" aria-label={t('aiBench.remove')} className={secondaryClass} onClick={() => setTurns(turns.filter((_, j) => j !== i))}><X className="size-4" /></button>
        </div>)}</div>
        <button type="button" className={`${secondaryClass} mt-2`} onClick={() => setTurns([...turns, { speaker: turns.at(-1)?.speaker === 'agent' ? 'lead' : 'agent', text: '' }])}><Plus className="size-4" />{t('aiBench.case.addTurn')}</button>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-300">{t('aiBench.case.groundTruth')}</p>
        <div className="space-y-2">{questions.map(q => <div key={q.fieldKey} className="grid grid-cols-[160px_1fr_auto] items-center gap-2">
          <span className="truncate text-xs text-slate-300">{q.label || q.fieldKey} <span className="text-slate-500">({q.type})</span></span>
          {q.type === 'boolean'
            ? <select aria-label={q.fieldKey} className={inputClass} disabled={expected[q.fieldKey]?.unknown} value={expected[q.fieldKey]?.value || ''} onChange={e => setExpected({ ...expected, [q.fieldKey]: { value: e.target.value, unknown: false } })}><option value="">{t('aiBench.case.notAnswered')}</option><option value="true">{t('aiBench.yes')}</option><option value="false">{t('aiBench.no')}</option></select>
            : <input dir="auto" aria-label={q.fieldKey} className={inputClass} placeholder={t('aiBench.case.notAnswered')} disabled={expected[q.fieldKey]?.unknown} value={expected[q.fieldKey]?.value || ''} onChange={e => setExpected({ ...expected, [q.fieldKey]: { value: e.target.value, unknown: false } })} />}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400"><input type="checkbox" checked={Boolean(expected[q.fieldKey]?.unknown)} onChange={e => setExpected({ ...expected, [q.fieldKey]: { value: '', unknown: e.target.checked } })} />{t('aiBench.case.saidUnknown')}</label>
        </div>)}</div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-300">{t('aiBench.case.extraction')}</p>
        <div className="space-y-2">{items.map((it, i) => <div key={i} className="grid grid-cols-[160px_1fr_auto] gap-2">
          <input aria-label={t('aiBench.case.category')} className={inputClass} placeholder={t('aiBench.case.category')} value={it.category} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} />
          <input dir="auto" aria-label={t('aiBench.case.value')} className={inputClass} placeholder={t('aiBench.case.value')} value={it.value} onChange={e => setItems(items.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
          <button type="button" aria-label={t('aiBench.remove')} className={secondaryClass} onClick={() => setItems(items.filter((_, j) => j !== i))}><X className="size-4" /></button>
        </div>)}</div>
        <button type="button" className={`${secondaryClass} mt-2`} onClick={() => setItems([...items, { category: 'budget', value: '' }])}><Plus className="size-4" />{t('aiBench.case.addItem')}</button>
      </div>
      <div className="rounded-xl border border-white/8 p-3">
        <p className="mb-2 text-xs font-medium text-slate-300">{t('aiBench.case.audio')}</p>
        {audio ? <div className="space-y-2">
          <p className="text-[11px] text-slate-400">{t('aiBench.case.audioAttached')} <button type="button" className="text-sky-300 underline" onClick={() => setAudio(null)}>{t('aiBench.remove')}</button></p>
          <AgentField label={t('aiBench.case.reference')} hint={t('aiBench.case.referenceHint')}><textarea dir="auto" className={inputClass} rows={3} value={audio.referenceTranscript} onChange={e => setAudio({ ...audio, referenceTranscript: e.target.value })} /></AgentField>
          <AgentField label={t('aiBench.case.sttLanguage')}><input className={inputClass} placeholder={language === 'en' ? 'en' : 'ur'} value={audio.sttLanguage || ''} onChange={e => setAudio({ ...audio, sttLanguage: e.target.value || null })} /></AgentField>
        </div> : <label className={`${secondaryClass} cursor-pointer`}>{uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{t('aiBench.case.upload')}
          <input type="file" accept="audio/*" className="sr-only" onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            setUploading(true); setError(null);
            try { const up = await callingQualityApi.uploadAudio(file); setAudio({ fileId: up.fileId, mimeType: up.mimeType, referenceTranscript: '', sttLanguage: null }); } catch (err) { setError(readableError(err)); } finally { setUploading(false); }
          }} /></label>}
      </div>
    </div>
  </AgentDialog>;
}

function ReviewDialog({ suite, c, onClose }: { suite: BenchmarkSuite; c: BenchmarkCase; onClose: () => void }) {
  const t = useT();
  const [note, setNote] = useState(c.reviewNote || '');
  const [error, setError] = useState<string | null>(null);
  const review = useQualityMutation((approved: boolean) => callingQualityApi.reviewCase(c._id, { approved, revision: c.revision, note }));
  const act = async (approved: boolean) => { setError(null); try { await review.mutateAsync(approved); onClose(); } catch (e) { setError(readableError(e)); } };
  const labelOf = (key: string) => suite.questionnaire.questions.find(q => q.fieldKey === key)?.label || key;
  return <AgentDialog wide title={t('aiBench.review.title', { title: c.title })} description={t('aiBench.review.hint')} onClose={onClose}
    footer={<div className="flex flex-wrap items-center justify-end gap-2">{error && <p role="alert" className="me-auto text-xs text-rose-300">{error}</p>}
      {c.reviewed && <button className={secondaryClass} disabled={review.isPending} onClick={() => void act(false)}>{t('aiBench.review.withdraw')}</button>}
      <button className={primaryClass} disabled={review.isPending} onClick={() => void act(true)}><BadgeCheck className="size-4" />{t('aiBench.review.approve', { revision: c.revision })}</button></div>}>
    <div className="space-y-4">
      {c.sample && <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3 text-xs text-amber-100">{t('aiBench.review.sampleWarning')}</p>}
      <ol className="space-y-1.5">{c.turns.map((turn, i) => <li key={i} className={`flex gap-2 text-sm ${turn.speaker === 'lead' ? 'text-slate-100' : 'text-slate-400'}`}><span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">{t(`aiBench.speaker.${turn.speaker}`)}</span><span dir="auto">{turn.text}</span>{turn.startMs != null && <span className="ms-auto text-[10px] tabular-nums text-slate-500">{turn.startMs}–{turn.endMs ?? '?'} ms</span>}</li>)}</ol>
      <div className="rounded-xl border border-white/8 p-3"><p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">{t('aiBench.case.groundTruth')}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{c.groundTruth.answers.map(a => <div key={a.fieldKey} className="contents"><dt className="text-slate-400">{labelOf(a.fieldKey)}</dt><dd dir="auto" className="text-slate-100">{a.expectUnknown ? t('aiBench.case.saidUnknown') : display(a.expected)}</dd></div>)}</dl>
        {c.groundTruth.extraction.length > 0 && <p className="mt-2 text-xs text-slate-400">{c.groundTruth.extraction.map(i => `${i.category}: ${display(i.value)}`).join(' · ')}</p>}
      </div>
      <AgentField label={t('aiBench.review.note')}><textarea className={inputClass} rows={2} value={note} onChange={e => setNote(e.target.value)} /></AgentField>
    </div>
  </AgentDialog>;
}

function RunsPanel({ suite }: { suite: BenchmarkSuite }) {
  const t = useT();
  const { canWrite } = useRoles();
  const runs = useBenchmarkRuns(suite._id);
  const [starting, setStarting] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const toggle = (id: string) => setCompare(compare.includes(id) ? compare.filter(x => x !== id) : [...compare.slice(-1), id]);
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-end gap-2"><button className={primaryClass} disabled={!canWrite} onClick={() => setStarting(true)}><Play className="size-4" />{t('aiBench.run.start')}</button></div>
    {runs.data && !runs.data.length && <p className={`${panelClass} text-center text-xs text-slate-400`}>{t('aiBench.run.none')}</p>}
    <ul className="space-y-2">{runs.data?.map(r => <li key={r._id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1425] p-3.5">
      <input type="checkbox" aria-label={t('aiBench.run.selectCompare')} checked={compare.includes(r._id)} disabled={r.status !== 'completed'} onChange={() => toggle(r._id)} />
      <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpenRun(openRun === r._id ? null : r._id)}>
        <p className="text-sm font-medium text-slate-100">{r.label || t('aiBench.run.untitled')} <span className="text-xs font-normal text-slate-500">· {when(r.createdAt)}</span></p>
        <p className="text-[11px] text-slate-500">{t(`aiBench.run.status.${r.status}`)}{r.scriptVersionId ? ` · ${t('aiBench.run.scriptVersion')}` : ''}{r.knowledgeVersionId ? ` · ${t('aiBench.run.knowledge', { id: r.knowledgeVersionId })}` : ''}{r.error ? ` · ${r.error}` : ''}</p>
      </button>
      <div className="text-end text-xs"><p className="font-semibold tabular-nums text-slate-100">{r.status === 'completed' ? pct(r.metrics?.overall.fieldAccuracy, 1) ?? t('aiBench.noScore') : '—'}</p>
        {r.metrics && <p className="text-[10px] text-slate-500">{t('aiBench.run.scoredCases', { n: r.metrics.overall.cases, excluded: r.metrics.unreviewedExcluded })}</p>}</div>
      {(r.status === 'queued' || r.status === 'running') && <Loader2 className="size-4 animate-spin text-sky-300" />}
    </li>)}</ul>
    {compare.length === 2 && <Comparison a={compare[0]} b={compare[1]} />}
    {openRun && <RunResults runId={openRun} suite={suite} />}
    {starting && <StartRunDialog suite={suite} onClose={() => setStarting(false)} />}
  </div>;
}

function StartRunDialog({ suite, onClose }: { suite: BenchmarkSuite; onClose: () => void }) {
  const t = useT();
  const [label, setLabel] = useState('');
  const [agentId, setAgentId] = useState('');
  const [scriptVersionId, setScriptVersionId] = useState('');
  const [knowledgeVersionId, setKnowledgeVersionId] = useState('');
  const [includeExtractor, setIncludeExtractor] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const agents = useCallingAgents({ sort: 'name' });
  const versions = useScriptVersions(agentId);
  const start = useQualityMutation(() => callingQualityApi.startRun(suite._id, { label, scriptVersionId: scriptVersionId || null, knowledgeVersionId: knowledgeVersionId || null, includeExtractor, includeAudio }));
  return <AgentDialog title={t('aiBench.run.start')} description={t('aiBench.run.hint')} onClose={onClose}
    footer={<div className="flex justify-end gap-2"><button className={secondaryClass} onClick={onClose}>{t('aiBench.cancel')}</button><button className={primaryClass} disabled={start.isPending} onClick={async () => { await start.mutateAsync(undefined); onClose(); }}><Play className="size-4" />{t('aiBench.run.go')}</button></div>}>
    <div className="space-y-4">
      <AgentField label={t('aiBench.run.label')}><input className={inputClass} value={label} onChange={e => setLabel(e.target.value)} /></AgentField>
      <div className="grid gap-3 sm:grid-cols-2">
        <AgentField label={t('aiBench.run.agent')}><select className={inputClass} value={agentId} onChange={e => { setAgentId(e.target.value); setScriptVersionId(''); }}><option value="">{t('aiBench.run.suiteQuestions')}</option>{agents.data?.data.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select></AgentField>
        <AgentField label={t('aiBench.run.version')} hint={t('aiBench.run.versionHint')}><select className={inputClass} disabled={!agentId} value={scriptVersionId} onChange={e => setScriptVersionId(e.target.value)}><option value="">—</option>{versions.data?.map(v => <option key={v._id} value={v._id}>v{v.number}{v.label ? ` · ${v.label}` : ''}{v.active ? ` (${t('aiExp.active')})` : ''}</option>)}</select></AgentField>
      </div>
      <AgentField label={t('aiBench.run.knowledgeId')} hint={t('aiBench.run.knowledgeHint')}><input className={inputClass} value={knowledgeVersionId} onChange={e => setKnowledgeVersionId(e.target.value)} /></AgentField>
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={includeExtractor} onChange={e => setIncludeExtractor(e.target.checked)} /><span>{t('aiBench.run.extractor')}<span className="block text-[11px] text-slate-500">{t('aiBench.run.extractorHint')}</span></span></label>
      <label className="flex items-start gap-2 text-xs text-slate-300"><input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)} /><span>{t('aiBench.run.audio')}<span className="block text-[11px] text-slate-500">{t('aiBench.run.audioHint')}</span></span></label>
    </div>
  </AgentDialog>;
}

function MetricRow({ label, m, t }: { label: string; m?: BenchmarkMetrics; t: Translate }) {
  const nr = t('aiBench.noScore');
  return <tr className="border-t border-white/[0.06]">
    <td className="px-3 py-2 text-slate-200">{label}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-400">{m?.cases ?? 0}</td>
    <td className="px-3 py-2 text-end font-semibold tabular-nums text-slate-50">{pct(m?.fieldAccuracy, 1) ?? nr}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-300">{pct(m?.exactMatchRate, 1) ?? nr}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-300">{pct(m?.missRate, 1) ?? nr}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-300">{pct(m?.falsePositiveRate, 1) ?? nr}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-300">{m?.extraction ? `${pct(m.extraction.precision) ?? '—'} / ${pct(m.extraction.recall) ?? '—'}` : t('aiBench.notRun')}</td>
    <td className="px-3 py-2 text-end tabular-nums text-slate-300">{m?.wer ? pct(m.wer.value, 1) : t('aiBench.notRun')}</td>
  </tr>;
}

function MetricsTable({ run, t }: { run: BenchmarkRun; t: Translate }) {
  const m = run.metrics!;
  return <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1425]">
    <table className="w-full min-w-[760px] text-sm">
      <thead><tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{['group', 'cases', 'accuracy', 'exact', 'missed', 'falsePositive', 'extraction', 'wer'].map((h, i) => <th key={h} className={`px-3 py-2.5 ${i ? 'text-end' : 'text-start'}`}>{t(`aiBench.metric.${h}`)}</th>)}</tr></thead>
      <tbody>
        <MetricRow label={t('aiBench.metric.overall')} m={m.overall} t={t} />
        {Object.entries(m.byLanguage).map(([k, v]) => <MetricRow key={`l-${k}`} label={languageName(t, k)} m={v} t={t} />)}
        {Object.entries(m.byCondition).map(([k, v]) => <MetricRow key={`c-${k}`} label={t(`aiBench.condition.${k}`)} m={v} t={t} />)}
      </tbody>
    </table>
  </div>;
}

const OUTCOME_CLASS: Record<string, string> = { exact: 'text-emerald-300', normalized: 'text-emerald-200', wrong: 'text-rose-300', missed: 'text-amber-300', false_positive: 'text-rose-300', correct_empty: 'text-slate-500' };
function RunResults({ runId }: { runId: string; suite: BenchmarkSuite }) {
  const t = useT();
  const run = useBenchmarkRun(runId).data;
  if (!run) return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />{t('aiQuality.loading')}</p>;
  if (run.status !== 'completed' || !run.metrics) return <p className={`${panelClass} text-xs text-slate-400`}>{t(`aiBench.run.status.${run.status}`)}{run.error ? ` · ${run.error}` : ''}</p>;
  return <section className="space-y-3">
    {run.metrics.unreviewedExcluded > 0 && <p className="text-xs text-amber-200">{t('aiBench.run.excludedNote', { n: run.metrics.unreviewedExcluded })}</p>}
    <MetricsTable run={run} t={t} />
    <p className="text-[11px] text-slate-500">{t('aiBench.run.extractorUsed', { name: run.extractor || '—' })} · {t(`aiBench.run.source.${run.questionnaireSource}`)}</p>
    <ul className="space-y-2">{run.caseResults?.map(r => <li key={r.caseId} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-slate-100">{r.title}</p><span className={chip}>{languageName(t, r.language)}</span>
        {!r.scored && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">{t('aiBench.run.notScored')}</span>}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{r.fields.filter(f => f.outcome !== 'correct_empty').map(f => <li key={f.fieldKey}><span className="text-slate-400">{f.fieldKey}: </span><span className={OUTCOME_CLASS[f.outcome]}>{t(`aiBench.outcome.${f.outcome}`)}</span><span dir="auto" className="text-slate-500"> ({display(f.predicted) || '∅'} / {display(f.expected) || '∅'})</span></li>)}</ul>
      {r.extraction.status === 'error' && <p className="mt-1 text-[11px] text-rose-300">{t('aiBench.run.extractionError', { error: r.extraction.error || '' })}</p>}
      {r.audio.status === 'ok' && <p className="mt-1 text-[11px] text-slate-400">WER {pct(r.audio.wer, 1)} · <span dir="auto">{r.audio.hypothesis}</span></p>}
      {r.audio.status === 'error' && <p className="mt-1 text-[11px] text-rose-300">{r.audio.error}</p>}
    </li>)}</ul>
  </section>;
}

function Comparison({ a, b }: { a: string; b: string }) {
  const t = useT();
  const cmp = useRunComparison(a, b).data;
  if (!cmp) return null;
  const delta = (d: number | null) => d == null ? '—' : `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pt`;
  return <section className={panelClass}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><GitCompare className="size-4 text-sky-300" />{t('aiBench.compare.title', { a: cmp.a.label || when(cmp.a.createdAt), b: cmp.b.label || when(cmp.b.createdAt) })}</h3>
    {!cmp.sameSuite && <p className="mt-1 text-xs text-amber-200">{t('aiBench.compare.otherSuite')}</p>}
    <table className="mt-3 w-full text-sm"><thead><tr className="text-[10px] uppercase tracking-wider text-slate-500"><th className="text-start">{t('aiBench.metric.group')}</th><th className="text-end">A</th><th className="text-end">B</th><th className="text-end">Δ</th></tr></thead>
      <tbody>{(['fieldAccuracy', 'exactMatchRate', 'missRate', 'falsePositiveRate'] as const).map(k => <tr key={k} className="border-t border-white/[0.06]"><td className="py-1.5 text-slate-300">{t(`aiBench.compare.${k}`)}</td><td className="text-end tabular-nums">{pct(cmp.overall[k].a, 1) ?? '—'}</td><td className="text-end tabular-nums">{pct(cmp.overall[k].b, 1) ?? '—'}</td><td className="text-end tabular-nums text-slate-100">{delta(cmp.overall[k].delta)}</td></tr>)}
        {[...cmp.byLanguage.map(r => ({ ...r, label: languageName(t, r.key) })), ...cmp.byCondition.map(r => ({ ...r, label: t(`aiBench.condition.${r.key}`) }))].map(r => <tr key={r.label} className="border-t border-white/[0.06] text-xs"><td className="py-1.5 text-slate-400">{r.label} <span className="text-slate-600">({r.casesA}/{r.casesB})</span></td><td className="text-end tabular-nums">{pct(r.fieldAccuracy.a, 1) ?? '—'}</td><td className="text-end tabular-nums">{pct(r.fieldAccuracy.b, 1) ?? '—'}</td><td className="text-end tabular-nums">{delta(r.fieldAccuracy.delta)}</td></tr>)}
      </tbody></table>
    {cmp.cases.some(c => c.correctA !== c.correctB) && <ul className="mt-3 space-y-1 text-xs">{cmp.cases.filter(c => c.correctA !== c.correctB).map(c => <li key={c.caseId} className="text-slate-300">{c.title}: {c.correctA} → {c.correctB} / {c.fields}{!c.sameRevision && <span className="text-amber-200"> · {t('aiBench.compare.edited')}</span>}</li>)}</ul>}
  </section>;
}
