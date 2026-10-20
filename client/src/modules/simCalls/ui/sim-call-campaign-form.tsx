'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { leadApi } from '@/modules/leads/services/lead-api';
import { ConditionEditor, type ConditionValue } from '@/modules/aiCalling/ui/condition-editor';
import { useSimCallMutations } from '../hooks/use-sim-calls';
import { fieldKeyFrom } from '../sim-call-domain';
import type { SimCallCampaign, SimCallQuestion } from '../types/sim-call-types';

const QUESTION_TYPES = ['short_text', 'long_text', 'boolean', 'single_choice', 'multiple_choice', 'integer', 'currency', 'date', 'email'];
const CHOICE = new Set(['single_choice', 'multiple_choice']);
const DAYS: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500/30';

const EXAMPLE: SimCallQuestion[] = [
  { fieldKey: 'right_contact', label: 'Right contact', text: 'Am I speaking with the person responsible?', type: 'boolean', required: true, order: 1, options: [] },
  { fieldKey: 'interest', label: 'Interest', text: 'Would the offered service be interesting for you?', type: 'single_choice', required: true, order: 2, options: ['high', 'medium', 'low', 'none'] },
  { fieldKey: 'requirements', label: 'Budget / requirements', text: 'What budget or requirements do you have?', type: 'long_text', required: false, order: 3, options: [],
    condition: { all: [{ field: 'interest', in: ['high', 'medium'] }] } },
  { fieldKey: 'follow_up_date', label: 'Follow-up date', text: 'When should we follow up?', type: 'date', required: false, order: 4, options: [] },
];

/**
 * Create a SIM call campaign on the server (as a draft). The calls are placed by the Updata
 * Android app from the user's own SIM; this form only configures the campaign.
 */
export function SimCallCampaignForm({ onClose, onCreated, initialLeadIds = [] }: {
  onClose: () => void; onCreated: (c: SimCallCampaign) => void; initialLeadIds?: string[];
}) {
  const { create } = useSimCallMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map(initialLeadIds.map((id) => [id, id])));
  const [search, setSearch] = useState('');
  const [questions, setQuestions] = useState<SimCallQuestion[]>(EXAMPLE);
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('19:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [countdown, setCountdown] = useState(10);
  const [autoDial, setAutoDial] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryDelay, setRetryDelay] = useState(60);
  const [readAloud, setReadAloud] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leads = useQuery({
    queryKey: ['sim-calls', 'lead-search', search],
    queryFn: () => leadApi.listLeads({ q: search || undefined, limit: 20 }),
  });

  const errors = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push('Enter a campaign name.');
    if (!selected.size) out.push('Select at least one lead.');
    if (!questions.length) out.push('Add at least one question.');
    questions.forEach((q, i) => {
      if (!q.label.trim() || !q.text.trim()) out.push(`Question ${i + 1} needs a label and the question text.`);
      if (CHOICE.has(q.type) && !q.options.length) out.push(`Question ${i + 1} needs answer options.`);
    });
    if (!days.length) out.push('Choose at least one calling day.');
    return out;
  }, [name, selected, questions, days]);

  const setQ = (i: number, change: Partial<SimCallQuestion>) =>
    setQuestions((list) => list.map((q, j) => (j === i ? { ...q, ...change } : q)));

  const submit = async () => {
    setError(null);
    if (errors.length) return setError(errors[0]!);
    const campaign = await create.mutateAsync({
      name: name.trim(), description: description.trim(), instructions: instructions.trim(),
      leadIds: [...selected.keys()],
      questionnaire: { questions: questions.map((q, i) => ({ ...q, order: i + 1, condition: q.condition ?? null })) },
      settings: { timezone, callWindow: { start, end }, daysOfWeek: days, countdownSeconds: countdown, autoDial, maxAttempts, retryDelayMinutes: retryDelay, readAloud },
    });
    onCreated(campaign);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="New SIM call campaign">
      <div className="flex h-full w-full max-w-3xl flex-col bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">New SIM call campaign</h2>
            <p className="text-xs text-muted-foreground">Calls are made by the Updata Android app from the caller&apos;s own SIM. The caller talks; answers are captured and synced here.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">1. Details</h3>
            <label className="block space-y-1 text-sm"><span>Name</span><input aria-label="Campaign name" className={input} value={name} maxLength={160} onChange={(e) => setName(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span>Description</span><input className={input} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></label>
            <label className="block space-y-1 text-sm"><span>Opening / script shown to the caller</span><textarea className={input} rows={3} value={instructions} maxLength={2000} onChange={(e) => setInstructions(e.target.value)} /></label>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">2. Leads ({selected.size} selected)</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input aria-label="Search leads" className={`${input} pl-9`} placeholder="Search leads by name, number…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              {leads.isLoading ? <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : null}
              {leads.data?.data.map((lead) => {
                const checked = selected.has(lead.id);
                const phone = lead.mobile || lead.phone;
                return (
                  <label key={lead.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted/40">
                    <input type="checkbox" checked={checked} onChange={() => setSelected((m) => { const n = new Map(m); if (checked) n.delete(lead.id); else n.set(lead.id, lead.name); return n; })} />
                    <span className="flex-1">{lead.name}</span>
                    <span className="text-xs text-muted-foreground">{phone ? 'phone ✓' : 'no phone'}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">3. Questions (asked in this order)</h3>
              <button type="button" className="inline-flex items-center gap-1 text-sm text-brand-500" onClick={() => setQuestions((l) => [...l, {
                fieldKey: fieldKeyFrom(`question ${l.length + 1}`, new Set(l.map((q) => q.fieldKey))), label: '', text: '', type: 'short_text', required: false, order: l.length + 1, options: [],
              }])}><Plus className="h-4 w-4" /> Add question</button>
            </div>
            {questions.map((q, i) => (
              <div key={q.fieldKey} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex gap-2">
                  <input aria-label={`Question ${i + 1} label`} className={input} placeholder="Label" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
                  <select aria-label={`Question ${i + 1} type`} className={input} value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>
                    {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setQuestions((l) => l.filter((_, j) => j !== i))} className="rounded-lg p-2 hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
                </div>
                <textarea aria-label={`Question ${i + 1} text`} className={input} rows={2} placeholder="What the caller asks" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                <input className={input} placeholder="Hint / follow-up prompt (optional)" value={q.description ?? ''} onChange={(e) => setQ(i, { description: e.target.value })} />
                {CHOICE.has(q.type) ? (
                  <input className={input} placeholder="Options, comma separated" value={q.options.join(', ')} onChange={(e) => setQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
                ) : null}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} /> Required</label>
                {i > 0 ? (
                  <ConditionEditor
                    condition={(q.condition ?? null) as ConditionValue}
                    onChange={(c) => setQ(i, { condition: c as SimCallQuestion['condition'] })}
                    fields={questions.slice(0, i).map((p) => ({ value: p.fieldKey, label: p.label || p.fieldKey }))}
                    allowEmpty
                    addLabel="Only ask if…"
                  />
                ) : null}
              </div>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <h3 className="text-sm font-semibold sm:col-span-2">4. Calling rules</h3>
            <label className="space-y-1 text-sm"><span>Timezone (calling hours, callbacks)</span><input className={input} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
            <div className="flex gap-2">
              <label className="flex-1 space-y-1 text-sm"><span>From</span><input type="time" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="flex-1 space-y-1 text-sm"><span>To</span><input type="time" className={input} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {DAYS.map(([d, label]) => (
                <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={days.includes(d)} onChange={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))} /> {label}</label>
              ))}
            </div>
            <label className="space-y-1 text-sm"><span>Pause before next lead (s)</span><input type="number" min={3} max={120} className={input} value={countdown} onChange={(e) => setCountdown(Math.min(120, Math.max(3, Number(e.target.value) || 10)))} /></label>
            <label className="space-y-1 text-sm"><span>Attempts per lead (no answer / busy)</span><input type="number" min={1} max={5} className={input} value={maxAttempts} onChange={(e) => setMaxAttempts(Math.min(5, Math.max(1, Number(e.target.value) || 1)))} /></label>
            <label className="space-y-1 text-sm"><span>Retry after (minutes)</span><input type="number" min={5} max={10080} className={input} value={retryDelay} onChange={(e) => setRetryDelay(Math.min(10080, Math.max(5, Number(e.target.value) || 60)))} /></label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} /> Auto-dial the next lead after the pause (app open only)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} /> Offer read-aloud of questions</label>
            </div>
          </section>
          <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            Safeguards: before every call the server re-checks that the campaign is running, the lead may be called (no do-not-call, valid number) and that it is within calling hours. A dialled lead without a recorded outcome is never redialled automatically. Callbacks get an exact date, time and timezone and are not called earlier.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span className="text-sm text-destructive" role="alert">{error}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={create.isPending} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {create.isPending ? 'Saving…' : 'Create campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
