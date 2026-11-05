'use client';

import Link from 'next/link';
import { Route } from 'lucide-react';
import { inputClass } from '@/modules/aiCalling/ui/calling-agent-primitives';
import type { CallingAgentInput } from '@/modules/aiCalling/types/ai-calling-types';
import { useAssignableUsers } from '../hooks/use-inbound-calls';
import { enumLabel, type T } from '../inbound-domain';
import { DEFAULT_STATUS_BY_RESULT, ROUTING_RESULT_KEYS, WORK_STATUSES, type ClosingQuestion } from '../types/inbound-call-types';
import { ClosingQuestionsEditor } from './closing-questions-editor';
import { Field, Toggle, selectClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

type Inbound = NonNullable<CallingAgentInput['inbound']>;

/**
 * The receptionist part of a calling agent (CallingAgent.inbound), edited through the agent PATCH:
 * greeting and instructions, routing after the call, and the questions asked before goodbye.
 * Every change keeps the other inbound keys (the PATCH replaces the whole object).
 */
export function AgentInboundFields({ value, onChange }: { value?: Inbound; onChange: (next: Inbound) => void }) {
  const { t } = useInboundLanguage();
  const v = value ?? {};
  const set = (patch: Partial<Inbound>) => onChange({ greeting: '', instructions: '', escalationInstructions: '', ...v, ...patch });
  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('inbound.agent.hint', 'Used when this agent answers incoming calls on your connected phone. Leave empty to use the standard receptionist behaviour.')}{' '}
        <Link href="/incoming-calls?tab=settings" className="text-primary hover:underline">{t('inbound.agent.openSettings', 'Incoming call settings')}</Link>
      </p>
      <Field label={t('inbound.agent.greeting', 'Greeting')} hint={t('inbound.agent.greetingHint', 'The first sentence callers hear. Empty uses a standard greeting that names your business and says it is a virtual assistant.')}>
        <textarea rows={2} maxLength={500} className={inputClass} value={v.greeting ?? ''} onChange={(e) => set({ greeting: e.target.value })} />
      </Field>
      <Field label={t('inbound.agent.instructions', 'Receptionist instructions')} hint={t('inbound.agent.instructionsHint', 'What to ask, what to tell callers about your services, and what to avoid.')}>
        <textarea rows={6} maxLength={4000} className={inputClass} value={v.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value })} />
      </Field>
      <Field label={t('inbound.agent.escalation', 'When to hand over to a person')} hint={t('inbound.agent.escalationHint', 'For example complaints, urgent support or a caller who insists.')}>
        <textarea rows={3} maxLength={1000} className={inputClass} value={v.escalationInstructions ?? ''} onChange={(e) => set({ escalationInstructions: e.target.value })} />
      </Field>
      <ClosingQuestionsEditor t={t} value={(v.closingQuestions ?? []) as ClosingQuestion[]} onChange={(closingQuestions) => set({ closingQuestions })} />
      <RoutingEditor t={t} value={v} onChange={set} />
    </div>
  );
}

/** Routing after the call: who gets it, whether that beats the lead's owner, and the status per result. */
export function RoutingEditor({ t, value, onChange }: { t: T; value: Inbound; onChange: (patch: Partial<Inbound>) => void }) {
  const { users } = useAssignableUsers();
  const map = value.statusByResult ?? {};
  const assignee = value.assignToUserId ?? '';
  const options = assignee && !users.some((u) => u.id === assignee) ? [{ id: assignee, name: assignee }, ...users] : users;
  return (
    <section aria-labelledby="routing-title" className="space-y-3 rounded-2xl border border-border p-4">
      <div>
        <h3 id="routing-title" className="flex items-center gap-2 text-sm font-semibold"><Route className="size-4 text-primary" />{t('inbound.routing.title', 'Routing after the call')}</h3>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{t('inbound.routing.hint', 'After each call the agent sets a status and an owner. A change made by a person is never overwritten.')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('inbound.routing.assignTo', 'Assign calls to')}>
          <select aria-label={t('inbound.routing.assignTo', 'Assign calls to')} className={inputClass} value={assignee} onChange={(e) => onChange({ assignToUserId: e.target.value || null })}>
            <option value="">{t('inbound.routing.nobody', 'No one (keep the lead owner)')}</option>
            {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <div className="self-end">
          <Toggle label={t('inbound.routing.override', 'Even when the lead already has an owner')} disabled={!assignee} checked={Boolean(value.assignOverridesLeadOwner)} onChange={(c) => onChange({ assignOverridesLeadOwner: c })} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead><tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-2 text-start">{t('inbound.routing.whenResult', 'When the result is…')}</th><th className="py-2 text-start">{t('inbound.routing.setStatus', 'set the status to…')}</th></tr></thead>
          <tbody>
            {ROUTING_RESULT_KEYS.map((k) => {
              const def = DEFAULT_STATUS_BY_RESULT[k];
              return (
                <tr key={k} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pe-3">{enumLabel(t, 'routingResult', k)}</td>
                  <td className="py-1.5">
                    <select aria-label={enumLabel(t, 'routingResult', k)} className={`${selectClass} w-full`} value={map[k] ?? def} onChange={(e) => onChange({ statusByResult: { ...map, [k]: e.target.value } })}>
                      {WORK_STATUSES.map((s) => <option key={s} value={s}>{enumLabel(t, 'work', s)}{s === def ? ` (${t('inbound.routing.default', 'default')})` : ''}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
