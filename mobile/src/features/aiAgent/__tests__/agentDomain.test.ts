import { ApiError } from '@/services/api/apiErrors';

import {
  availableActions,
  callReadiness,
  canStart,
  defaultQuestions,
  defaultStatusRules,
  estimateSegments,
  filterLanguages,
  isValidTimezone,
  questionErrors,
  reasonCounts,
  smsReadiness,
  toQuestionnaire,
} from '../domain/agentDomain';
import { smsRecipientSchema, type AgentLanguage, type MessagingHealth } from '../types';

const languages: AgentLanguage[] = [
  {
    code: 'auto',
    name: "Automatic (match the lead's language)",
    nativeName: 'Auto',
    support: 'full',
    rtl: false,
  },
  { code: 'de', name: 'German', nativeName: 'Deutsch', support: 'full', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', support: 'full', rtl: false },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', support: 'full', rtl: true },
  { code: 'yue', name: 'Chinese (Cantonese)', nativeName: '粵語', support: 'limited', rtl: false },
];

const texts = {
  decision_authority: { label: 'DM', text: 'Decide?' },
  need: { label: 'Need', text: 'Need?' },
  interest: { label: 'Interest', text: 'Interest?' },
  timeline: { label: 'Timeline', text: 'When?' },
  callback_time: { label: 'Callback', text: 'Callback?' },
};

describe('filterLanguages', () => {
  it('returns all languages for an empty query', () => {
    expect(filterLanguages(languages, '  ')).toHaveLength(languages.length);
  });

  it('matches English name, native name, code, ignoring case and accents', () => {
    expect(filterLanguages(languages, 'GERM').map((l) => l.code)).toEqual(['de']);
    expect(filterLanguages(languages, 'francais').map((l) => l.code)).toEqual(['fr']);
    expect(filterLanguages(languages, 'اردو').map((l) => l.code)).toEqual(['ur']);
    expect(filterLanguages(languages, 'canton').map((l) => l.code)).toEqual(['yue']);
    expect(filterLanguages(languages, 'klingon')).toEqual([]);
  });
});

describe('readiness gating', () => {
  const pending = { data: undefined, isPending: true, isError: false, error: null };

  it('calls are ready only when the server reports a configured trunk', () => {
    expect(
      callReadiness({
        data: { configured: true, livekitReady: true, reason: null },
        isPending: false,
        isError: false,
        error: null,
      }),
    ).toEqual({ state: 'ready' });
    expect(
      callReadiness({
        data: { configured: false, livekitReady: true, reason: 'no_sip_trunk' },
        isPending: false,
        isError: false,
        error: null,
      }),
    ).toEqual({ state: 'not_ready', reason: 'no_sip_trunk' });
    expect(callReadiness(pending)).toEqual({ state: 'checking' });
  });

  it('a forbidden health endpoint means "unknown", never "ready"', () => {
    const forbidden = new ApiError({ kind: 'http', status: 403, message: 'Forbidden' });
    expect(callReadiness({ data: undefined, isPending: false, isError: true, error: forbidden })).toEqual({
      state: 'unknown',
      forbidden: true,
    });
  });

  it('SMS is ready when an enabled provider passes its live check', () => {
    const health = (textbeeEnabled: boolean, eligible: boolean): MessagingHealth => ({
      settings: { providers: { textbeeEnabled, twilioEnabled: false } },
      providers: {
        textbee: { eligible, reason: eligible ? null : 'auth_failed' },
        twilio: { eligible: false, reason: null },
      },
    });
    const q = (data: MessagingHealth) => ({ data, isPending: false, isError: false, error: null });
    expect(smsReadiness(q(health(true, true)))).toEqual({ state: 'ready' });
    expect(smsReadiness(q(health(true, false)))).toEqual({ state: 'not_ready', reason: 'auth_failed' });
    // A healthy but disabled provider does not count.
    expect(smsReadiness(q(health(false, true)))).toEqual({ state: 'not_ready', reason: 'no_sms_provider' });
  });

  it('Start needs eligible leads, and for calls a confirmed-ready trunk', () => {
    expect(canStart('call', { state: 'ready' }, 3)).toBe(true);
    expect(canStart('call', { state: 'ready' }, 0)).toBe(false);
    expect(canStart('call', { state: 'not_ready', reason: 'no_sip_trunk' }, 3)).toBe(false);
    expect(canStart('call', { state: 'unknown', forbidden: true }, 3)).toBe(false);
    expect(canStart('call', { state: 'checking' }, 3)).toBe(false);
    expect(canStart('sms', { state: 'unknown', forbidden: true }, 3)).toBe(true);
    expect(canStart('sms', { state: 'not_ready', reason: 'no_sms_provider' }, 3)).toBe(false);
  });
});

describe('campaign actions mirror the server guards', () => {
  it('offers pause/resume/cancel only where the server allows them', () => {
    expect(availableActions('running')).toEqual(['pause', 'cancel']);
    expect(availableActions('paused')).toEqual(['resume', 'cancel']);
    expect(availableActions('draft')).toEqual(['cancel']);
    expect(availableActions('completed')).toEqual([]);
    expect(availableActions('cancelled')).toEqual([]);
  });
});

describe('SMS segment estimate', () => {
  const recipient = (text: string, eligible = true) =>
    smsRecipientSchema.parse({
      _id: Math.random().toString(16).slice(2),
      status: eligible ? 'draft' : 'ineligible',
      leadId: { _id: 'l', name: 'Lead' },
      eligibility: { eligible, reasons: eligible ? [] : ['consent_required'] },
      rendered: { bodyText: text },
    });

  it('sums segments of the server-rendered text of eligible recipients', () => {
    const rows = [recipient('Hello Ana'), recipient('x'.repeat(161)), recipient('skip', false)];
    expect(estimateSegments(rows, 2)).toEqual({ segments: 3, sampled: 2, exact: true });
  });

  it('extrapolates and marks the estimate approximate when only a page is loaded', () => {
    expect(estimateSegments([recipient('Hi'), recipient('Hi')], 10)).toEqual({
      segments: 10,
      sampled: 2,
      exact: false,
    });
  });

  it('groups ineligibility reasons', () => {
    const rows = [recipient('a', false), recipient('b', false), recipient('c')];
    expect(reasonCounts(rows)).toEqual([['consent_required', 2]]);
  });
});

describe('call defaults', () => {
  it('builds a valid questionnaire from the CRM qualification fields', () => {
    const questions = defaultQuestions(texts);
    expect(questions.map((q) => q.fieldKey)).toEqual([
      'decision_authority',
      'need',
      'interest',
      'timeline',
      'callback_time',
    ]);
    expect(questionErrors(questions)).toEqual([]);
    const questionnaire = toQuestionnaire(questions);
    expect(questionnaire.questions[0]).toMatchObject({
      order: 1,
      options: [
        { value: 'decision_maker', label: 'decision_maker' },
        { value: 'influencer', label: 'influencer' },
        { value: 'no_authority', label: 'no_authority' },
      ],
    });
    expect(questionnaire.questions[1]!.options).toEqual([]);
  });

  it('qualification rules always require review and drop rules for removed fields', () => {
    const all = defaultStatusRules(defaultQuestions(texts));
    expect(all.find((rule) => rule.action === 'mark_qualified')?.requiresReview).toBe(true);
    const withoutDecision = defaultStatusRules(
      defaultQuestions(texts).filter((q) => q.fieldKey !== 'decision_authority'),
    );
    expect(withoutDecision.map((rule) => rule.id)).toEqual(['not_interested']);
  });

  it('flags incomplete questions and invalid time zones', () => {
    const questions = defaultQuestions(texts);
    questions[1] = { ...questions[1]!, text: ' ' };
    expect(questionErrors(questions)).toEqual([1]);
    expect(isValidTimezone('Europe/Zurich')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
});
