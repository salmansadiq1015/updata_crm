// Mode A (human-led SIM call) guidance: which question to ask next, and which next
// steps the answers suggest. Pure and deterministic — the user is always the one who
// speaks and decides; nothing here changes a lead by itself.
import type { OutcomeDraft } from './operations';
import type { QualificationField } from '../types';

type Answers = OutcomeDraft['answers'];

/** Conversation order for the CRM qualification fields (unknown fields go last, in schema order). */
const GUIDE_ORDER = [
  'need',
  'current_solution',
  'role',
  'decision_authority',
  'interest',
  'budget',
  'timeline',
  'objections',
  'requested_info',
  'preferred_channel',
  'callback_time',
  'next_action',
];

const value = (answers: Answers, key: string) => {
  const a = answers[key];
  return a && a.status === 'answered' ? a.value.trim() : '';
};
/** A question is handled once it has a value or an explicit non-default status (refused / n/a). */
const handled = (answers: Answers, key: string) => {
  const a = answers[key];
  return Boolean(a && (a.value.trim() || a.status === 'refused' || a.status === 'not_applicable'));
};

/**
 * Branching: answers make some questions irrelevant.
 *  - No interest  → only the objection (why not) and preferred channel are worth asking.
 *  - Not a decision maker → skip budget; ask who decides / when to call back instead.
 */
export function skippedByAnswers(answers: Answers): Set<string> {
  const skip = new Set<string>();
  if (value(answers, 'interest') === 'none') {
    ['budget', 'timeline', 'requested_info', 'next_action', 'callback_time'].forEach((k) => skip.add(k));
  }
  if (value(answers, 'decision_authority') === 'no_authority') skip.add('budget');
  return skip;
}

export type GuideState = {
  question: QualificationField | null;
  /** 1-based position among the questions still relevant. */
  position: number;
  total: number;
};

export function nextGuideQuestion(
  schema: readonly QualificationField[],
  answers: Answers,
  skippedByUser: ReadonlySet<string> = new Set(),
): GuideState {
  const rank = (key: string) => {
    const i = GUIDE_ORDER.indexOf(key);
    return i === -1 ? GUIDE_ORDER.length + schema.findIndex((f) => f.fieldKey === key) : i;
  };
  const skip = skippedByAnswers(answers);
  const relevant = [...schema]
    .filter((f) => !skip.has(f.fieldKey))
    .sort((a, b) => rank(a.fieldKey) - rank(b.fieldKey));
  const done = relevant.filter((f) => handled(answers, f.fieldKey) || skippedByUser.has(f.fieldKey)).length;
  const question =
    relevant.find((f) => !handled(answers, f.fieldKey) && !skippedByUser.has(f.fieldKey)) ?? null;
  return { question, position: Math.min(done + 1, relevant.length), total: relevant.length };
}

export type NextStep =
  | { kind: 'follow_up'; days: number; reason: 'hot' | 'callback' | 'timeline' }
  | { kind: 'status'; status: 'qualified' | 'unqualified' }
  | { kind: 'send_sms'; reason: 'requested_info' | 'prefers_sms' };

/** Suggestions only: each is applied by an explicit tap. */
export function suggestNextSteps(answers: Answers, disposition: string | null): NextStep[] {
  const steps: NextStep[] = [];
  const interest = value(answers, 'interest');
  const timeline = value(answers, 'timeline');
  if (disposition === 'callback_requested' || value(answers, 'callback_time'))
    steps.push({ kind: 'follow_up', days: 1, reason: 'callback' });
  else if (interest === 'high') steps.push({ kind: 'follow_up', days: 1, reason: 'hot' });
  else if (timeline === 'immediate' || timeline === 'within_3_months' || interest === 'medium')
    steps.push({ kind: 'follow_up', days: 3, reason: 'timeline' });

  if (interest === 'none' || disposition === 'not_interested')
    steps.push({ kind: 'status', status: 'unqualified' });
  else if (
    (interest === 'high' || interest === 'medium') &&
    value(answers, 'decision_authority') === 'decision_maker' &&
    value(answers, 'need')
  ) {
    steps.push({ kind: 'status', status: 'qualified' });
  }

  if (value(answers, 'requested_info')) steps.push({ kind: 'send_sms', reason: 'requested_info' });
  else if (value(answers, 'preferred_channel') === 'sms')
    steps.push({ kind: 'send_sms', reason: 'prefers_sms' });
  return steps;
}
