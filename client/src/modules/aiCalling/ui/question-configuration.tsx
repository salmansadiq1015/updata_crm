'use client';
import { useState } from 'react';
import { Plus, Trash2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import type { Question, QuestionType, StatusRule, RuleAction } from '../types/ai-calling-types';
import { ConditionEditor, type ConditionValue, type FieldOption } from './condition-editor';
const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const smallSel = inputCls + ' w-auto';
const QUESTION_TYPES: QuestionType[] = ['short_text', 'long_text', 'boolean', 'single_choice', 'multiple_choice', 'integer', 'decimal', 'currency', 'date', 'time', 'email', 'phone', 'url', 'address', 'rating', 'enum'];
const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'enum']);
const ACTIONS: RuleAction[] = ['mark_qualified', 'mark_unqualified', 'mark_not_interested', 'schedule_callback', 'request_review', 'mark_do_not_contact', 'mark_contacted', 'none'];
const earlierFieldOptions = (questions: Question[], idx: number): FieldOption[] => questions.slice(0, idx).filter(q => q.label).map(q => ({ value: q.fieldKey, label: q.label }));
const allFieldOptions = (questions: Question[]): FieldOption[] => earlierFieldOptions(questions, questions.length);
export function QuestionEditor({ questions, onChange, isLink = false }: { questions: Question[]; onChange: (questions: Question[]) => void; isLink?: boolean }) {
 const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
 const fieldError = (_field: string) => false;
 const updateQuestion = (idx: number, patch: Partial<Question>) => onChange(questions.map((q, i) => i === idx ? { ...q, ...patch } : q));
 const removeQuestion = (idx: number) => onChange(questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 })));
 const addQuestion = () => onChange([...questions, { fieldKey: 'q_' + crypto.randomUUID().replaceAll('-', '_'), label: '', text: '', type: 'short_text', required: true, order: questions.length + 1 }]);
 const move = (idx: number, direction: number) => { const next = [...questions]; [next[idx], next[idx + direction]] = [next[idx + direction], next[idx]]; onChange(next.map((q, i) => ({ ...q, order: i + 1 }))); };
 return (
<div className="space-y-3">
              <p className="text-xs text-muted-foreground">Questions are asked in order. The AI rephrases naturally but keeps each question&apos;s meaning. Answers are validated server-side by type.</p>
              {questions.map((q, idx) => (
                <div key={q.fieldKey} className={`rounded-lg border bg-background p-3 ${fieldError(`q:${q.fieldKey}`) ? 'border-rose-500/60' : 'border-border'}`}>
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-2 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input className={inputCls} aria-label={`Question ${idx + 1} label`} placeholder="Label (e.g. Decision maker)" value={q.label} onChange={(e) => updateQuestion(idx, { label: e.target.value })} />
                        <select className={inputCls} aria-label={`Question ${idx + 1} answer type`} value={q.type} onChange={(e) => updateQuestion(idx, { type: e.target.value as QuestionType })}>
                          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <input className={inputCls} aria-label={`Question ${idx + 1} text`} placeholder={isLink ? 'Question the assistant asks' : 'Question the agent asks'} value={q.text} onChange={(e) => updateQuestion(idx, { text: e.target.value })} />
                      <details className="rounded-lg border border-border p-2 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Answer guidance and validation</summary><div className="mt-3 space-y-3">
                        <label className="block space-y-1">Instructions / expected answer format<textarea className={inputCls} maxLength={1000} rows={2} value={q.description || ''} onChange={e => updateQuestion(idx, { description: e.target.value })} /></label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(['min', 'max', 'maxLength', 'maxClarifications'] as const).map(key => <label key={key} className="block space-y-1">{({ min: 'Minimum value', max: 'Maximum value', maxLength: 'Max answer length', maxClarifications: isLink ? 'Clarifications' : 'Question repeats' })[key]}<input type="number" className={inputCls} min={key === 'maxClarifications' || key === 'maxLength' ? 0 : undefined} max={key === 'maxClarifications' ? 5 : undefined} disabled={key === 'maxClarifications' && !isLink} value={key === 'maxClarifications' && !isLink ? 3 : q[key] ?? ''} onChange={e => updateQuestion(idx, { [key]: e.target.value === '' ? key === 'maxClarifications' ? 2 : null : Number(e.target.value) })} /></label>)}</div>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(q.sensitive)} onChange={e => updateQuestion(idx, { sensitive: e.target.checked })} />Sensitive answer</label>
                      </div></details>
                      {CHOICE_TYPES.has(q.type) ? (
                        <input
                          className={inputCls}
                          placeholder="Options, comma-separated (e.g. yes, no, later)"
                          value={optionDrafts[q.fieldKey] ?? (q.options || []).map((o) => (typeof o === 'string' ? o : o.value)).join(', ')}
                          aria-label={`Question ${idx + 1} options`}
                          onChange={(e) => { setOptionDrafts(previous => ({ ...previous, [q.fieldKey]: e.target.value })); updateQuestion(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }); }}
                        />
                      ) : null}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Required</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.confirmCritical} onChange={(e) => updateQuestion(idx, { confirmCritical: e.target.checked })} /> Confirm (read back)</label>
                        <input className="w-40 max-w-full rounded border border-border bg-card px-2 py-1" aria-label="CRM field (mapTo)" placeholder="CRM field (mapTo)" value={q.mapTo || ''} onChange={(e) => updateQuestion(idx, { mapTo: e.target.value })} />
                        <code className="text-[10px]">{q.fieldKey}</code>
                      </div>
                      {/* Show-if branching: only ask this question when earlier answers match. */}
                      {idx > 0 ? (
                        <div className="rounded-md border border-dashed border-border/70 px-2.5 py-2">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ask only if</span>
                          <ConditionEditor
                            condition={(q.condition as ConditionValue) ?? null}
                            onChange={(next) => updateQuestion(idx, { condition: next })}
                            fields={earlierFieldOptions(questions, idx)}
                            allowEmpty
                            addLabel="Always ask — add a show-if condition"
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label={`Move question ${idx + 1} up`} className="rounded p-1.5 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={idx === questions.length - 1} onClick={() => move(idx, 1)} aria-label={`Move question ${idx + 1} down`} className="rounded p-1.5 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => removeQuestion(idx)} aria-label={`Remove question ${idx + 1}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addQuestion} disabled={questions.length >= 40} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand-500 hover:text-brand-500"><Plus className="h-4 w-4" /> Add question</button>
            </div>
 );
}
export function QualificationRulesEditor({ questions, rules, onChange }: { questions: Question[]; rules: StatusRule[]; onChange: (rules: StatusRule[]) => void }) {
 const fieldKeys = questions.filter(q => q.label).map(q => q.fieldKey);
 const addRule = () => onChange([...rules, { id: crypto.randomUUID(), when: { all: [{ field: fieldKeys[0] || '', equals: '' }] }, action: 'mark_qualified', requiresReview: false }]);
 const updateRule = (idx: number, patch: Partial<StatusRule>) => onChange(rules.map((r, i) => i === idx ? { ...r, ...patch } : r));
 return (
<div className="space-y-3">
              <p className="text-xs text-muted-foreground">Rules evaluate the collected answers after the call. The first matching rule wins. A completed call never qualifies a lead unless a rule says so, and incomplete answers always go to review.</p>
              {rules.map((r, idx) => (
                <div key={r.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="mt-1 shrink-0 text-muted-foreground">If</span>
                        <div className="flex-1">
                          <ConditionEditor
                            condition={r.when as ConditionValue}
                            onChange={(next) => updateRule(idx, { when: (next || { all: [] }) as StatusRule['when'] })}
                            fields={allFieldOptions(questions)}
                            addLabel="add condition"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground">then</span>
                        <select className={smallSel} value={r.action} onChange={(e) => updateRule(idx, { action: e.target.value as RuleAction })}>
                          {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
                        </select>
                        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={r.requiresReview} onChange={(e) => updateRule(idx, { requiresReview: e.target.checked })} /> needs review</label>
                      </div>
                    </div>
                    <button type="button" onClick={() => onChange(rules.filter((_, i) => i !== idx))} aria-label={`Remove rule ${idx + 1}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addRule} disabled={!fieldKeys.length} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"><Plus className="h-4 w-4" /> Add rule</button>
            </div>
 );
}
