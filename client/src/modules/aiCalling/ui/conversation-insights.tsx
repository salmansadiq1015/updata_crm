'use client';

import type { CallRecord } from '../types/ai-calling-types';

const statusLabels: Record<string, string> = {
  answered: 'Answered', unknown: 'Lead does not know', needs_clarification: 'Needs clarification',
  needs_confirmation: 'Needs confirmation', not_applicable: 'Condition not met', not_answered: 'Not answered', pending: 'Awaiting answer',
};
const display = (value: unknown) => Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value ?? '');

export function CallAnswerChecklist({ call }: { call: CallRecord }) {
  const coverage = call.questionCoverage;
  const questions = coverage?.questions || call.answers.map(answer => ({
    ...answer, fieldKey: answer.questionFieldKey, question: '', required: false, eligible: true,
    noResponseCount: 0, reason: null,
    status: answer.validation === 'valid' ? 'answered' : answer.validation === 'unknown' ? 'unknown' : 'needs_clarification',
  }));
  return <div className="space-y-3">
    {coverage && <div className="space-y-1 rounded-xl border border-border bg-muted/20 p-3 text-xs"><p className="font-medium">{coverage.answered} of {coverage.applicable} applicable questions have validated answers</p><p className="text-muted-foreground">{coverage.unanswered} unanswered · {coverage.unknown} unknown · {coverage.needsClarification + coverage.needsConfirmation} need review · {coverage.notApplicable} conditionally excluded</p>{coverage.requiredGaps.length > 0 && <p className="pt-1 text-amber-600 dark:text-amber-400">{coverage.requiredGaps.length} required question(s) still need complete, confirmed information.</p>}</div>}
    {questions.length ? questions.map((question, index) => <article key={question.fieldKey} className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{index + 1}. {question.label}{question.required && <span className="ms-1 text-[10px] text-muted-foreground">Required</span>}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${question.status === 'answered' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{statusLabels[question.status] || question.status}</span></div>
      {question.question && <p className="text-xs text-muted-foreground">{question.question}</p>}
      <p dir="auto" className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{question.rawAnswer || (question.normalizedValue != null ? display(question.normalizedValue) : question.status === 'unknown' ? 'The lead does not know the answer.' : question.status === 'not_applicable' ? 'This question’s condition is not met by the recorded answers.' : 'No answer has been recorded.')}</p>
      {question.rawAnswer && question.normalizedValue != null && question.rawAnswer !== display(question.normalizedValue) && <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">Validated value: {display(question.normalizedValue)}</p>}
      {(question.noResponseCount || 0) > 0 && <p className="text-[10px] text-amber-600 dark:text-amber-400">{Math.min(3, question.noResponseCount || 0)} of 3 repeats used{question.status === 'not_answered' ? ' · No usable answer received; moved to the next question.' : ''}</p>}
      {question.confirmed && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Confirmed by lead</p>}
    </article>) : <p className="py-8 text-center text-sm text-muted-foreground">No questions are configured for this call.</p>}
  </div>;
}

export function ConversationInsightsPanel({ call }: { call: CallRecord }) {
  const insights = call.conversationInsights;
  if (!insights) return <p className="py-8 text-center text-sm text-muted-foreground">Conversation insights are not available yet.</p>;
  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-muted/20 p-3"><h3 className="text-sm font-medium">Recorded conversation signals</h3><p className="mt-1 text-xs text-muted-foreground">{insights.participation.leadTurns} lead turns · {insights.participation.agentTurns} agent turns · {insights.participation.interruptedAgentTurns} interrupted agent turns</p><p className="mt-2 text-xs text-muted-foreground">Counts cover the available transcript.</p></div>
    {insights.observations.length ? insights.observations.map(item => <article key={item.code} className="rounded-xl border border-border p-3"><h3 className="text-sm font-medium">{item.label}</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.evidence}</p></article>) : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No explicit callback, decline, or handoff request has been recorded. Buying intent is not established.</p>}
    {insights.nextSteps.length > 0 && <section className="rounded-xl border border-primary/20 bg-primary/5 p-3"><h3 className="text-sm font-medium">Suggested next steps</h3><ul className="mt-2 list-disc space-y-2 ps-4 text-xs leading-relaxed">{insights.nextSteps.map(step => <li key={step}>{step}</li>)}</ul><p className="mt-3 text-[10px] text-muted-foreground">Suggestions only. No message or follow-up is sent from this view.</p></section>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">{insights.limitation}</p>
  </div>;
}
