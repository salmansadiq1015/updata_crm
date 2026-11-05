'use client';

import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ArrowDown, ArrowUp, LayoutTemplate, MessageCircleQuestion, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuestionTemplates } from '../hooks/use-inbound-calls';
import { addTemplateQuestions, enumLabel, moveItem, type T } from '../inbound-domain';
import {
  CLOSING_QUESTION_TYPES, CLOSING_STANDARD_KEYS, MAX_CLOSING_QUESTIONS,
  type ClosingQuestion, type ClosingQuestionType,
} from '../types/inbound-call-types';
import { inputClass, secondaryClass, selectClass } from './inbound-primitives';

const blank = (): ClosingQuestion => ({ key: '', label: '', question: '', type: 'text', required: false, options: [] });
const isStandard = (key: string) => (CLOSING_STANDARD_KEYS as readonly string[]).includes(key);

/**
 * "Questions before goodbye": what the receptionist asks near the end of each call. Contact
 * details save to the lead's own fields; anything else is a custom answer on the call.
 */
export function ClosingQuestionsEditor({ value, onChange, t }: { value: ClosingQuestion[]; onChange: (next: ClosingQuestion[]) => void; t: T }) {
  const templates = useQuestionTemplates();
  const [notice, setNotice] = useState<string | null>(null);
  const full = value.length >= MAX_CLOSING_QUESTIONS;
  const update = (i: number, patch: Partial<ClosingQuestion>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <section aria-labelledby="closing-questions-title" className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="closing-questions-title" className="flex items-center gap-2 text-sm font-semibold"><MessageCircleQuestion className="size-4 text-primary" />{t('inbound.closing.title', 'Questions before goodbye')}</h3>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{t('inbound.closing.hint', 'Asked one at a time near the end of the call. The agent skips anything the caller already answered and accepts a refusal politely.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={cn(secondaryClass, 'h-9 min-h-0 px-3 text-xs')} disabled={full}><LayoutTemplate className="size-3.5" />{t('inbound.closing.addTemplate', 'Add from template')}</DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" className="z-50 w-72 rounded-xl border border-border bg-card p-1 text-xs text-foreground shadow-xl">
                {templates.isLoading ? <p className="px-3 py-2 text-muted-foreground">{t('inbound.common.loading', 'Loading…')}</p> : null}
                {(templates.data?.templates ?? []).map((tpl) => (
                  <DropdownMenu.Item key={tpl.id} onSelect={() => {
                    const r = addTemplateQuestions(value, tpl);
                    onChange(r.questions);
                    setNotice(t('inbound.closing.added', 'Added {added} question(s); {skipped} already present or over the limit.', { added: r.added, skipped: r.skipped }));
                  }} className="cursor-pointer rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-muted">
                    <p className="font-medium">{t(`inbound.closing.template.${tpl.id}`, tpl.name)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t(`inbound.closing.template.${tpl.id}.hint`, tpl.description)}</p>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" className={cn(secondaryClass, 'h-9 min-h-0 px-3 text-xs')} disabled={full} onClick={() => onChange([...value, blank()])}><Plus className="size-3.5" />{t('inbound.closing.add', 'Add question')}</button>
        </div>
      </div>
      {notice ? <p role="status" className="text-xs text-sky-700 dark:text-sky-300">{notice}</p> : null}
      {full ? <p className="text-xs text-amber-700 dark:text-amber-300">{t('inbound.closing.max', 'Up to {max} questions.', { max: MAX_CLOSING_QUESTIONS })}</p> : null}
      {!value.length ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{t('inbound.closing.empty', 'No questions yet. Add one, or start from a template.')}</p> : (
        <ol className="space-y-3">
          {value.map((q, i) => (
            <li key={i} className="rounded-xl border border-border bg-card/60 p-3" aria-label={t('inbound.closing.rowLabel', 'Question {n}', { n: i + 1 })}>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="text-xs font-medium text-muted-foreground">{t('inbound.closing.label', 'Label')}
                  <input className={cn(inputClass, 'mt-1 min-h-0 py-2')} maxLength={80} value={q.label} onChange={(e) => update(i, { label: e.target.value })} placeholder={t('inbound.closing.labelPlaceholder', 'e.g. Delivery address')} />
                </label>
                <label className="text-xs font-medium text-muted-foreground">{t('inbound.closing.savesTo', 'Saves to')}
                  <select className={cn(selectClass, 'mt-1 h-9 w-full')} value={isStandard(q.key) ? q.key : ''} onChange={(e) => update(i, { key: e.target.value })}>
                    <option value="">{t('inbound.closing.custom', 'Custom answer')}</option>
                    {CLOSING_STANDARD_KEYS.map((k) => <option key={k} value={k}>{enumLabel(t, 'standardKey', k)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-muted-foreground sm:col-span-2">{t('inbound.closing.question', 'What the agent asks')}
                  <textarea rows={2} className={cn(inputClass, 'mt-1')} maxLength={300} value={q.question} onChange={(e) => update(i, { question: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-muted-foreground">{t('inbound.closing.type', 'Answer type')}
                  <select className={cn(selectClass, 'mt-1 h-9 w-full')} value={q.type} onChange={(e) => update(i, { type: e.target.value as ClosingQuestionType })}>
                    {CLOSING_QUESTION_TYPES.map((ty) => <option key={ty} value={ty}>{enumLabel(t, 'questionType', ty)}</option>)}
                  </select>
                </label>
                {q.type === 'choice' ? (
                  <label className="text-xs font-medium text-muted-foreground">{t('inbound.closing.options', 'Choices (comma separated)')}
                    <input className={cn(inputClass, 'mt-1 min-h-0 py-2')} value={q.options.join(', ')} onChange={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trimStart()).slice(0, 12) })} />
                  </label>
                ) : <div className="hidden sm:block" />}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} />{t('inbound.closing.important', 'Important')}<span className="text-muted-foreground">— {t('inbound.closing.importantHint', 'flagged as important to the agent; a refusal is still accepted')}</span></label>
                <div className="flex gap-1">
                  <button type="button" aria-label={t('inbound.closing.up', 'Move up')} disabled={i === 0} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => onChange(moveItem(value, i, i - 1))}><ArrowUp className="size-4" /></button>
                  <button type="button" aria-label={t('inbound.closing.down', 'Move down')} disabled={i === value.length - 1} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => onChange(moveItem(value, i, i + 1))}><ArrowDown className="size-4" /></button>
                  <button type="button" aria-label={t('inbound.closing.remove', 'Remove question')} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
