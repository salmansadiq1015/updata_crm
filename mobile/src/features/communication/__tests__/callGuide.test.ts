import { nextGuideQuestion, skippedByAnswers, suggestNextSteps } from '../domain/callGuide';
import type { QualificationField } from '../types';

const f = (fieldKey: string, type = 'short_text', options: string[] = []) =>
  ({ fieldKey, label: fieldKey, type, options, helpText: '' }) as unknown as QualificationField;
const schema = [
  f('budget', 'currency'),
  f('need', 'long_text'),
  f('interest', 'single_choice', ['high', 'medium', 'low', 'none']),
  f('decision_authority', 'single_choice', ['decision_maker', 'influencer', 'no_authority']),
  f('timeline', 'single_choice'),
  f('objections', 'long_text'),
  f('custom_x'),
];
const ans = (v: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(v).map(([k, value]) => [k, { value, status: 'answered', source: 'user', evidence: null }]),
  );

describe('call guide', () => {
  it('asks in conversation order, then custom fields', () => {
    expect(nextGuideQuestion(schema, {}).question?.fieldKey).toBe('need');
    expect(nextGuideQuestion(schema, ans({ need: 'faster oven' })).question?.fieldKey).toBe(
      'decision_authority',
    );
    const all = ans({
      need: 'x',
      decision_authority: 'decision_maker',
      interest: 'high',
      budget: '5000',
      timeline: 'later',
      objections: 'none',
    });
    expect(nextGuideQuestion(schema, all)).toMatchObject({
      question: { fieldKey: 'custom_x' },
      position: 7,
      total: 7,
    });
  });

  it('branches on answers: no interest skips budget/timeline; no authority skips budget', () => {
    const noInterest = ans({ need: 'x', decision_authority: 'influencer', interest: 'none' });
    expect([...skippedByAnswers(noInterest)]).toEqual(expect.arrayContaining(['budget', 'timeline']));
    expect(nextGuideQuestion(schema, noInterest).question?.fieldKey).toBe('objections');
    expect(skippedByAnswers(ans({ decision_authority: 'no_authority' })).has('budget')).toBe(true);
  });

  it('respects questions the user skipped or marked refused / not applicable', () => {
    const refused = { need: { value: '', status: 'refused', source: 'user', evidence: null } };
    expect(nextGuideQuestion(schema, refused, new Set(['decision_authority'])).question?.fieldKey).toBe(
      'interest',
    );
    expect(nextGuideQuestion([], {})).toEqual({ question: null, position: 0, total: 0 });
  });
});

describe('next-step suggestions', () => {
  it('suggests follow-up timing, a status and a follow-up SMS from the answers', () => {
    expect(
      suggestNextSteps(
        ans({
          interest: 'high',
          decision_authority: 'decision_maker',
          need: 'x',
          requested_info: 'price list',
        }),
        'interested',
      ),
    ).toEqual([
      { kind: 'follow_up', days: 1, reason: 'hot' },
      { kind: 'status', status: 'qualified' },
      { kind: 'send_sms', reason: 'requested_info' },
    ]);
    expect(suggestNextSteps(ans({ callback_time: 'Friday 3pm' }), null)).toEqual([
      { kind: 'follow_up', days: 1, reason: 'callback' },
    ]);
    expect(suggestNextSteps(ans({ interest: 'none' }), 'not_interested')).toEqual([
      { kind: 'status', status: 'unqualified' },
    ]);
    expect(suggestNextSteps(ans({ timeline: 'within_3_months', preferred_channel: 'sms' }), null)).toEqual([
      { kind: 'follow_up', days: 3, reason: 'timeline' },
      { kind: 'send_sms', reason: 'prefers_sms' },
    ]);
    expect(suggestNextSteps({}, null)).toEqual([]);
  });
});
