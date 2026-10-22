'use client';

import { useMemo, useState } from 'react';
import { X, Plus, Trash2, ChevronRight, ChevronLeft, GripVertical, Bot, MessageSquareText, PhoneCall } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { showError } from '@/lib/toast';
import { useCampaignMutations } from '../hooks/use-ai-calling';
import type {
  AgentConfig, CampaignChannel, CreateCampaignInput, LinkConfig, LinkLanguage, Question, QuestionType, RuleAction, Schedule, StatusRule,
} from '../types/ai-calling-types';
import { ConditionEditor, type ConditionValue, type FieldOption } from './condition-editor';
import { LanguageSelect } from './language-select';

/** Number inputs: an emptied field is NaN/0 — snap back into the server's accepted range. */
function clampInt(value: number | undefined, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min) return min;
  return Math.min(n, max);
}

const QUESTION_TYPES: QuestionType[] = [
  'short_text', 'long_text', 'boolean', 'single_choice', 'multiple_choice', 'integer',
  'decimal', 'currency', 'date', 'time', 'email', 'phone', 'url', 'address', 'rating',
];
const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'enum']);
const ACTIONS: RuleAction[] = [
  'mark_qualified', 'mark_unqualified', 'mark_not_interested', 'schedule_callback',
  'request_review', 'mark_do_not_contact', 'mark_contacted',
];
const VOICES = ['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'];

const DEFAULT_DISCLOSURE = 'Hi, this is an AI assistant calling on behalf of {company}. This call may be recorded. Do you have a moment to answer a few quick questions?';

let keyCounter = 0;
const newKey = (p: string) => `${p}_${Date.now()}_${keyCounter++}`;

function blankQuestion(order: number): Question {
  return { fieldKey: newKey('q'), label: '', text: '', type: 'short_text', required: true, order, options: [], maxClarifications: 2, confirmCritical: false };
}

// Only earlier questions can gate a later one (no forward/circular references).
function earlierFieldOptions(questions: Question[], idx: number): FieldOption[] {
  return questions.slice(0, idx).filter((q) => q.label).map((q) => ({ value: q.fieldKey, label: q.label }));
}
function allFieldOptions(questions: Question[]): FieldOption[] {
  return questions.filter((q) => q.label).map((q) => ({ value: q.fieldKey, label: q.label }));
}

function conditionHasClauses(condition: ConditionValue | undefined): boolean {
  return Boolean(condition && ((condition.all?.length ?? 0) > 0 || (condition.any?.length ?? 0) > 0));
}

const STEPS = ['Campaign & agent', 'Questions', 'Qualification rules', 'Schedule & leads', 'Review'];

const LINK_LANGUAGES: { value: LinkLanguage; label: string }[] = [
  { value: 'en', label: 'English' }, { value: 'ur', label: 'Urdu (اردو)' }, { value: 'roman_ur', label: 'Roman Urdu' },
];

const DEFAULT_LINK_CONFIG: LinkConfig = {
  expiryDays: 7, languages: ['en', 'ur', 'roman_ur'], defaultLanguage: 'en', personaName: 'Ayesha', personaTone: 'warm',
  reason: '', estimatedMinutes: 3, faq: [], voiceTier: 'off',
  reminders: { enabled: false, afterHours: 24, max: 1 },
  fallbackToCall: { enabled: false, simCallCampaignId: null, afterHours: 24 },
  limits: { maxTurns: 40, maxTokensPerTurn: 220, maxSessionMinutes: 30, dailySpendCap: 2 },
  transcriptRetentionDays: 90,
};

/** SIM call campaigns (human calls from the phone) a link campaign can fall back to. */
function useSimCallCampaigns(enabled: boolean) {
  return useQuery({
    queryKey: ['sim-calls', 'campaigns', 'fallback-options'],
    queryFn: async () => {
      const res = (await apiClient.get('/sim-calls/campaigns', { params: { limit: 50 } })) as { data?: { _id?: string; id?: string; name: string; status: string }[] };
      return (res.data ?? []).filter((c) => !['cancelled', 'completed'].includes(c.status)).map((c) => ({ id: String(c.id ?? c._id), name: c.name }));
    },
    enabled,
  });
}

export function CampaignWizard({ onClose, onCreated, initialLeadIds }: {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** When provided, the campaign calls exactly these leads instead of a filter. */
  initialLeadIds?: string[];
}) {
  const { create } = useCampaignMutations();
  const [step, setStep] = useState(0);
  const explicitLeadIds = initialLeadIds && initialLeadIds.length ? initialLeadIds : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agent, setAgent] = useState<AgentConfig>({
    agentName: 'Alex', organizationName: '', objective: '', language: 'en', voice: 'alloy',
    speakingStyle: 'professional', maxCallSeconds: 300, recordCall: false, disclosure: DEFAULT_DISCLOSURE,
  });
  const [questions, setQuestions] = useState<Question[]>([blankQuestion(1)]);
  const [rules, setRules] = useState<StatusRule[]>([]);
  const [schedule, setSchedule] = useState<Schedule>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5],
    maxConcurrency: 1, maxAttemptsPerLead: 2, retryDelayMinutes: 120, maxCallsPerDay: 100,
  });
  const [filters, setFilters] = useState<{ status?: string; country?: string; city?: string; businessType?: string }>({});
  const [isTest, setIsTest] = useState(false);
  const [channel, setChannel] = useState<CampaignChannel>('voice');
  const [link, setLink] = useState<LinkConfig>(DEFAULT_LINK_CONFIG);
  const isLink = channel === 'web_link';
  const simCampaigns = useSimCallCampaigns(isLink && link.fallbackToCall.enabled);

  const fieldKeys = useMemo(() => questions.filter((q) => q.label).map((q) => q.fieldKey), [questions]);

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }
  function addQuestion() { setQuestions((qs) => [...qs, blankQuestion(qs.length + 1)]); }
  function removeQuestion(idx: number) { setQuestions((qs) => qs.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 }))); }

  function addRule() {
    setRules((rs) => [...rs, { id: newKey('rule'), when: { all: [{ field: fieldKeys[0] || '', equals: '' }] }, action: 'mark_qualified', requiresReview: false }]);
  }
  function updateRule(idx: number, patch: Partial<StatusRule>) {
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function validateStep(): string | null {
    if (step === 0 && !name.trim()) return 'Campaign name is required';
    if (step === 0 && isLink && !agent.organizationName?.trim()) return 'The company name is shown to the lead: please fill it in';
    if (step === 0 && isLink && !link.languages.length) return 'Choose at least one language';
    if (step === 0 && isLink && link.faq.some((f) => !f.question.trim() || !f.answer.trim())) return 'Every FAQ entry needs a question and an answer';
    if (step === 1) {
      if (!questions.length) return 'Add at least one question';
      for (const q of questions) {
        if (!q.label.trim() || !q.text.trim()) return 'Every question needs a label and question text';
        if (CHOICE_TYPES.has(q.type) && !(q.options || []).length) return `"${q.label || 'A choice question'}" needs options`;
      }
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) { showError(err); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    const payload: CreateCampaignInput = {
      name: name.trim(),
      description: description.trim(),
      questionnaire: {
        questions: questions.map((q, i) => ({
          ...q,
          order: i + 1,
          options: CHOICE_TYPES.has(q.type)
            ? (q.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
            : [],
          // Drop an empty/forward-referencing condition so the server doesn't reject it.
          condition: conditionHasClauses(q.condition) ? q.condition : null,
        })),
      },
      // Conditions are already shaped + coerced by the editor; keep only rules
      // that actually have a condition.
      statusRules: rules.filter((r) => conditionHasClauses(r.when)),
      agentConfig: agent,
      schedule,
      channel,
      ...(isLink ? {
        linkConfig: {
          ...link,
          defaultLanguage: link.languages.includes(link.defaultLanguage) ? link.defaultLanguage : link.languages[0],
          fallbackToCall: { ...link.fallbackToCall, simCallCampaignId: link.fallbackToCall.enabled ? link.fallbackToCall.simCallCampaignId : null },
        },
      } : {}),
      selection: explicitLeadIds
        ? { mode: 'explicit', leadIds: explicitLeadIds }
        : { mode: 'filters', filters },
      isTest,
    };
    try {
      const campaign = await create.mutateAsync(payload);
      onCreated(campaign._id);
    } catch {
      /* toast handled in mutation */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-theme-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header + stepper */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand-500" />
              <h2 className="text-base font-bold">{isLink ? 'New SMS link campaign' : 'New calling campaign'}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${i <= step ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</div>
                <span className={`hidden text-xs sm:inline ${i === step ? 'font-semibold' : 'text-muted-foreground'}`}>{s}</span>
                {i < STEPS.length - 1 ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : null}
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Channel">
                <ChannelCard active={!isLink} onClick={() => setChannel('voice')} icon={PhoneCall} title="AI phone call" text="The AI calls the lead from a cloud phone number (needs a SIP number + LiveKit)." />
                <ChannelCard active={isLink} onClick={() => setChannel('web_link')} icon={MessageSquareText} title="SMS link → AI chat" text="You text each lead a personal link from your own SIM; an AI assistant collects the answers in a chat." />
              </div>
              <Field label="Campaign name" required>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 heating-system qualification" />
              </Field>
              <Field label="Description">
                <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              {isLink ? <LinkAgentFields link={link} setLink={setLink} agent={agent} setAgent={setAgent} /> : null}
              <div className={isLink ? 'hidden' : 'grid grid-cols-2 gap-3'}>
                <Field label="Agent name"><input className={inputCls} value={agent.agentName} onChange={(e) => setAgent({ ...agent, agentName: e.target.value })} /></Field>
                <Field label="Company name (disclosed)"><input className={inputCls} value={agent.organizationName} onChange={(e) => setAgent({ ...agent, organizationName: e.target.value })} placeholder="MB Boiler & Heizung AG" /></Field>
              </div>
              <Field label={isLink ? 'Objective (for the AI, not shown to the lead)' : 'Call objective'}><input className={inputCls} value={agent.objective} onChange={(e) => setAgent({ ...agent, objective: e.target.value })} placeholder="Qualify interest in a heating-system service contract" /></Field>
              {isLink ? null : (<>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Language"><LanguageSelect className={inputCls} value={agent.language || 'en'} onChange={(language) => setAgent({ ...agent, language })} /></Field>
                <Field label="Voice">
                  <select className={inputCls} value={agent.voice} onChange={(e) => setAgent({ ...agent, voice: e.target.value })}>
                    {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Speaking style">
                  <select className={inputCls} value={agent.speakingStyle} onChange={(e) => setAgent({ ...agent, speakingStyle: e.target.value as AgentConfig['speakingStyle'] })}>
                    {['professional', 'friendly', 'concise', 'formal'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="AI disclosure (spoken at the start)">
                <textarea className={inputCls} rows={2} value={agent.disclosure} onChange={(e) => setAgent({ ...agent, disclosure: e.target.value })} />
                <p className="mt-1 text-[11px] text-muted-foreground">{'{company}'} is replaced with the company name. Disclosing AI involvement is required in many jurisdictions.</p>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max call duration (seconds)"><input type="number" min={30} max={1800} className={inputCls} value={agent.maxCallSeconds} onChange={(e) => setAgent({ ...agent, maxCallSeconds: Number(e.target.value) })} onBlur={() => setAgent((a) => ({ ...a, maxCallSeconds: clampInt(a.maxCallSeconds, 30, 1800) }))} /></Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" checked={agent.recordCall} onChange={(e) => setAgent({ ...agent, recordCall: e.target.checked })} />
                  Record calls <span className="text-[11px] text-amber-600">(needs legal disclosure/consent)</span>
                </label>
              </div>
              </>)}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Questions are asked in order. The AI rephrases naturally but keeps each question&apos;s meaning. Answers are validated server-side by type.</p>
              {questions.map((q, idx) => (
                <div key={q.fieldKey} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputCls} placeholder="Label (e.g. Decision maker)" value={q.label} onChange={(e) => updateQuestion(idx, { label: e.target.value })} />
                        <select className={inputCls} value={q.type} onChange={(e) => updateQuestion(idx, { type: e.target.value as QuestionType })}>
                          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      <input className={inputCls} placeholder="Question the agent asks" value={q.text} onChange={(e) => updateQuestion(idx, { text: e.target.value })} />
                      {CHOICE_TYPES.has(q.type) ? (
                        <input
                          className={inputCls}
                          placeholder="Options, comma-separated (e.g. yes, no, later)"
                          value={(q.options || []).map((o) => (typeof o === 'string' ? o : o.value)).join(', ')}
                          onChange={(e) => updateQuestion(idx, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        />
                      ) : null}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> Required</label>
                        <label className="flex items-center gap-1.5"><input type="checkbox" checked={q.confirmCritical} onChange={(e) => updateQuestion(idx, { confirmCritical: e.target.checked })} /> Confirm (read back)</label>
                        <input className="w-40 rounded border border-border bg-card px-2 py-1" placeholder="CRM field (mapTo)" value={q.mapTo || ''} onChange={(e) => updateQuestion(idx, { mapTo: e.target.value })} />
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
                    <button type="button" onClick={() => removeQuestion(idx)} className="rounded p-1 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addQuestion} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand-500 hover:text-brand-500"><Plus className="h-4 w-4" /> Add question</button>
            </div>
          ) : null}

          {step === 2 ? (
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
                    <button type="button" onClick={() => setRules((rs) => rs.filter((_, i) => i !== idx))} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addRule} disabled={!fieldKeys.length} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-brand-500 hover:text-brand-500 disabled:opacity-50"><Plus className="h-4 w-4" /> Add rule</button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-background p-3">
                <h3 className="mb-2 text-sm font-semibold">Which leads to call</h3>
                {explicitLeadIds ? (
                  <p className="text-sm text-muted-foreground">Calling the <strong className="text-foreground">{explicitLeadIds.length}</strong> lead{explicitLeadIds.length > 1 ? 's' : ''} you selected. Only those with a valid phone number and no do-not-call flag will be called.</p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-muted-foreground">The server resolves these filters to the matching leads. Only leads with a valid phone number and no do-not-call flag will be called.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Status"><input className={inputCls} placeholder="e.g. new" value={filters.status || ''} onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })} /></Field>
                      <Field label="Country (ISO-2)"><input className={inputCls} placeholder="CH" value={filters.country || ''} onChange={(e) => setFilters({ ...filters, country: e.target.value || undefined })} /></Field>
                      <Field label="City"><input className={inputCls} value={filters.city || ''} onChange={(e) => setFilters({ ...filters, city: e.target.value || undefined })} /></Field>
                      <Field label="Business type"><input className={inputCls} value={filters.businessType || ''} onChange={(e) => setFilters({ ...filters, businessType: e.target.value || undefined })} /></Field>
                    </div>
                  </>
                )}
              </div>
              {isLink ? <LinkScheduleFields link={link} setLink={setLink} simCampaigns={simCampaigns.data ?? []} /> : null}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {isLink ? null : (<>
                <Field label="Concurrency"><input type="number" min={1} max={25} className={inputCls} value={schedule.maxConcurrency} onChange={(e) => setSchedule({ ...schedule, maxConcurrency: Number(e.target.value) })} onBlur={() => setSchedule((x) => ({ ...x, maxConcurrency: clampInt(x.maxConcurrency, 1, 25) }))} /></Field>
                <Field label="Max attempts/lead"><input type="number" min={1} max={10} className={inputCls} value={schedule.maxAttemptsPerLead} onChange={(e) => setSchedule({ ...schedule, maxAttemptsPerLead: Number(e.target.value) })} onBlur={() => setSchedule((x) => ({ ...x, maxAttemptsPerLead: clampInt(x.maxAttemptsPerLead, 1, 10) }))} /></Field>
                <Field label="Max calls/day"><input type="number" min={1} className={inputCls} value={schedule.maxCallsPerDay} onChange={(e) => setSchedule({ ...schedule, maxCallsPerDay: Number(e.target.value) })} onBlur={() => setSchedule((x) => ({ ...x, maxCallsPerDay: clampInt(x.maxCallsPerDay, 1, 100000) }))} /></Field>
                </>)}
                <Field label={isLink ? 'Sending hours from' : 'Window start'}><input type="time" className={inputCls} value={schedule.callWindow?.start} onChange={(e) => setSchedule({ ...schedule, callWindow: { ...schedule.callWindow!, start: e.target.value } })} /></Field>
                <Field label={isLink ? 'Sending hours until' : 'Window end'}><input type="time" className={inputCls} value={schedule.callWindow?.end} onChange={(e) => setSchedule({ ...schedule, callWindow: { ...schedule.callWindow!, end: e.target.value } })} /></Field>
                <Field label="Timezone"><input className={inputCls} value={schedule.timezone} onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
                Test campaign — build and simulate only; never changes lead data.
              </label>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3 text-sm">
              <Summary label="Campaign" value={name} />
              <Summary label="Channel" value={isLink ? 'SMS link → AI chat' : 'AI phone call'} />
              {isLink ? (
                <>
                  <Summary label="Assistant" value={`${link.personaName} (${link.personaTone}) · ${link.languages.join(', ')}`} />
                  <Summary label="Link" value={`valid ${link.expiryDays} days · ${link.reminders.enabled ? `${link.reminders.max} reminder(s) after ${link.reminders.afterHours}h` : 'no reminders'}`} />
                  <Summary label="FAQ entries" value={String(link.faq.length)} />
                  <Summary label="AI budget" value={`$${link.limits.dailySpendCap}/day · voice ${link.voiceTier}`} />
                </>
              ) : (
                <Summary label="Agent" value={`${agent.agentName} · ${agent.voice} · ${agent.speakingStyle}`} />
              )}
              <Summary label="Questions" value={`${questions.length} (${questions.filter((q) => q.required).length} required)`} />
              <Summary label="Rules" value={`${rules.length}`} />
              {isLink ? null : <Summary label="Concurrency / attempts" value={`${schedule.maxConcurrency} concurrent · up to ${schedule.maxAttemptsPerLead} attempts`} />}
              <Summary label="Call window" value={`${schedule.callWindow?.start}–${schedule.callWindow?.end} ${schedule.timezone}`} />
              <Summary label="Mode" value={isTest ? 'TEST (no CRM changes)' : 'Live'} />
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                {isLink ? (
                  <>The campaign is created as a <strong>draft</strong>. Use <strong>Preview as customer</strong> in its detail panel, then start it and send the links from the mobile app (Call Agent → Text leads from your phone). Every lead is told it is an AI assistant; &quot;STOP&quot; always opts out.</>
                ) : (
                  <>The campaign is created as a <strong>draft</strong>. Review eligibility and run a browser simulation from its detail panel before starting real calls. OpenAI Realtime + SIP usage is billable.</>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
            {step === 0 ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">Next <ChevronRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={submit} disabled={create.isPending} className="inline-flex items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">{create.isPending ? 'Creating…' : 'Create campaign'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500';
const smallSel = 'rounded-md border border-border bg-card px-2 py-1 text-sm';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}{required ? <span className="text-rose-500"> *</span> : null}</span>
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}


function ChannelCard({ active, onClick, icon: Icon, title, text }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500' : 'border-border hover:border-brand-500/60'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-brand-500" /> {title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{text}</span>
    </button>
  );
}

function LinkAgentFields({ link, setLink, agent, setAgent }: {
  link: LinkConfig; setLink: (l: LinkConfig) => void; agent: AgentConfig; setAgent: (a: AgentConfig) => void;
}) {
  const toggleLanguage = (value: LinkLanguage) => setLink({
    ...link, languages: link.languages.includes(value) ? link.languages.filter((l) => l !== value) : [...link.languages, value],
  });
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Assistant name (persona)"><input className={inputCls} value={link.personaName} onChange={(e) => setLink({ ...link, personaName: e.target.value })} /></Field>
        <Field label="Company name (shown to the lead)" required><input className={inputCls} value={agent.organizationName} onChange={(e) => setAgent({ ...agent, organizationName: e.target.value })} placeholder="Sunrise Solar" /></Field>
      </div>
      <Field label="Why you are contacting them (first message)">
        <input className={inputCls} value={link.reason} maxLength={300} onChange={(e) => setLink({ ...link, reason: e.target.value })} placeholder="You asked about solar panels on our website." />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Tone">
          <select className={inputCls} value={link.personaTone} onChange={(e) => setLink({ ...link, personaTone: e.target.value as LinkConfig['personaTone'] })}>
            <option value="warm">warm</option><option value="professional">professional</option><option value="concise">concise</option>
          </select>
        </Field>
        <Field label="Takes about (minutes)"><input type="number" min={1} max={30} className={inputCls} value={link.estimatedMinutes} onChange={(e) => setLink({ ...link, estimatedMinutes: clampInt(Number(e.target.value), 1, 30) })} /></Field>
        <Field label="Voice">
          <select className={inputCls} value={link.voiceTier} onChange={(e) => setLink({ ...link, voiceTier: e.target.value as LinkConfig['voiceTier'] })}>
            <option value="off">Off (text chat)</option>
            <option value="browser">Browser voice (free)</option>
            <option value="premium">Premium voice (LiveKit, owner approval)</option>
          </select>
        </Field>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Languages (auto-detected, switchable by the lead)</span>
        <div className="flex flex-wrap gap-3 text-sm">
          {LINK_LANGUAGES.map((l) => (
            <label key={l.value} className="flex items-center gap-1.5">
              <input type="checkbox" checked={link.languages.includes(l.value)} onChange={() => toggleLanguage(l.value)} /> {l.label}
              <input type="radio" name="defaultLanguage" className="ml-1" title="Start in this language" checked={link.defaultLanguage === l.value} onChange={() => setLink({ ...link, defaultLanguage: l.value })} disabled={!link.languages.includes(l.value)} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">FAQ: the only facts the assistant may use to answer questions</span>
        <div className="space-y-2">
          {link.faq.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input className={inputCls} placeholder="Question (e.g. Why do you have my number?)" value={f.question} onChange={(e) => setLink({ ...link, faq: link.faq.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
              <input className={inputCls} placeholder="Answer" value={f.answer} onChange={(e) => setLink({ ...link, faq: link.faq.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
              <button type="button" aria-label="Remove FAQ entry" onClick={() => setLink({ ...link, faq: link.faq.filter((_, j) => j !== i) })} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setLink({ ...link, faq: [...link.faq, { question: '', answer: '' }] })} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-brand-500 hover:text-brand-500"><Plus className="h-3.5 w-3.5" /> Add FAQ entry</button>
        </div>
      </div>
      <SmsTextsEditor link={link} setLink={setLink} company={agent.organizationName || ''} />
      <p className="text-[11px] text-muted-foreground">The first message always says it is an AI assistant from your company. Questions outside the FAQ are passed to your team, never answered by guessing.</p>
    </div>
  );
}

const SMS_LANGUAGE_LABEL: Record<string, string> = { en: 'English', ur: 'Urdu', roman_ur: 'Roman Urdu', fr: 'French', de: 'German', ar: 'Arabic' };
const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** Rough segment count for the editor (the server/app compute the exact one at send time). */
function segmentsOf(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = [...text].length;
  const unicode = !GSM7.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return { chars, unicode, segments: chars <= single ? 1 : Math.ceil(chars / multi) };
}

function SmsTextsEditor({ link, setLink, company }: { link: LinkConfig; setLink: (l: LinkConfig) => void; company: string }) {
  const defaults = useQuery({
    queryKey: ['link-assistant', 'templates', 'defaults'],
    queryFn: async () => {
      const res = (await apiClient.get('/link-assistant/templates')) as { data?: { language: string; template: string }[] };
      return res.data ?? [];
    },
    staleTime: Infinity,
  });
  const overrides = link.smsTemplates || {};
  const sample = 'https://updata.behjja.com/c/Xy7Kp2Qm9Ld4Rt6Vb1Nc8Z';
  return (
    <details className="rounded-lg border border-border/70 px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">SMS texts (optional): edit the message sent with the link</summary>
      <div className="mt-2 space-y-2">
        {(defaults.data ?? []).map((d) => {
          const value = overrides[d.language] ?? d.template;
          const stats = segmentsOf(value.replace(/\{link\}/g, sample).replace(/\{name\}/g, 'Muhammad Ali').replace(/\{company\}/g, company || 'Company').replace(/\{city\}/g, 'Lahore'));
          return (
            <label key={d.language} className="block">
              <span className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
                <span>{SMS_LANGUAGE_LABEL[d.language] || d.language}</span>
                <span className={stats.segments > 1 ? 'text-amber-600' : ''}>{stats.chars} chars · {stats.unicode ? 'Unicode' : 'GSM'} · {stats.segments} SMS{!value.includes('{link}') ? ' · missing {link}!' : ''}</span>
              </span>
              <textarea
                dir="auto"
                rows={2}
                className={inputCls}
                value={value}
                onChange={(e) => {
                  const next = { ...overrides };
                  if (e.target.value === d.template) delete next[d.language];
                  else next[d.language] = e.target.value;
                  setLink({ ...link, smsTemplates: Object.keys(next).length ? next : null });
                }}
              />
            </label>
          );
        })}
        <p className="text-[11px] text-muted-foreground">Placeholders: {'{name} {company} {city} {link}'}. Urdu and Arabic SMS hold only 70 characters each; with a link they usually take 2 SMS.</p>
      </div>
    </details>
  );
}

function LinkScheduleFields({ link, setLink, simCampaigns }: { link: LinkConfig; setLink: (l: LinkConfig) => void; simCampaigns: { id: string; name: string }[] }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
      <h3 className="text-sm font-semibold">Link, reminders and limits</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Link valid (days)"><input type="number" min={1} max={60} className={inputCls} value={link.expiryDays} onChange={(e) => setLink({ ...link, expiryDays: clampInt(Number(e.target.value), 1, 60) })} /></Field>
        <Field label="AI budget per day ($)"><input type="number" min={0} step={0.5} className={inputCls} value={link.limits.dailySpendCap} onChange={(e) => setLink({ ...link, limits: { ...link.limits, dailySpendCap: Math.max(0, Number(e.target.value) || 0) } })} /></Field>
        <Field label="Max messages per chat"><input type="number" min={5} max={200} className={inputCls} value={link.limits.maxTurns} onChange={(e) => setLink({ ...link, limits: { ...link.limits, maxTurns: clampInt(Number(e.target.value), 5, 200) } })} /></Field>
        <Field label="Keep transcripts (days)"><input type="number" min={1} max={730} className={inputCls} value={link.transcriptRetentionDays} onChange={(e) => setLink({ ...link, transcriptRetentionDays: clampInt(Number(e.target.value), 1, 730) })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={link.reminders.enabled} onChange={(e) => setLink({ ...link, reminders: { ...link.reminders, enabled: e.target.checked } })} /> Remind leads who have not finished</label>
        {link.reminders.enabled ? (
          <>
            <span className="text-muted-foreground">after</span>
            <input type="number" min={1} max={336} className="w-20 rounded border border-border bg-card px-2 py-1" value={link.reminders.afterHours} onChange={(e) => setLink({ ...link, reminders: { ...link.reminders, afterHours: clampInt(Number(e.target.value), 1, 336) } })} />
            <span className="text-muted-foreground">hours, at most</span>
            <input type="number" min={0} max={3} className="w-16 rounded border border-border bg-card px-2 py-1" value={link.reminders.max} onChange={(e) => setLink({ ...link, reminders: { ...link.reminders, max: clampInt(Number(e.target.value), 0, 3) } })} />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={link.fallbackToCall.enabled} onChange={(e) => setLink({ ...link, fallbackToCall: { ...link.fallbackToCall, enabled: e.target.checked } })} /> No answer? Add the lead to a call campaign (a person calls)</label>
        {link.fallbackToCall.enabled ? (
          <select className="rounded border border-border bg-card px-2 py-1" value={link.fallbackToCall.simCallCampaignId ?? ''} onChange={(e) => setLink({ ...link, fallbackToCall: { ...link.fallbackToCall, simCallCampaignId: e.target.value || null } })}>
            <option value="">Choose a SIM call campaign…</option>
            {simCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">Links are sent from your phone within the sending hours below. Reminders are sent the same way and never after the lead opted out or finished.</p>
    </div>
  );
}
