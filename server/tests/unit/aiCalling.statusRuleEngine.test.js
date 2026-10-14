import { describe, expect, it } from '@jest/globals';
import { evaluateOutcome } from '../../src/modules/aiCalling/engine/statusRuleEngine.js';

const rules = [
  { id: 'rule_qualified', when: { all: [{ field: 'active', equals: true }, { field: 'interest', equals: 'yes' }] }, action: 'mark_qualified' },
  { id: 'rule_callback', when: { any: [{ field: 'interest', equals: 'later' }] }, action: 'schedule_callback' },
  { id: 'rule_notinterested', when: { all: [{ field: 'interest', equals: 'no' }] }, action: 'mark_not_interested' },
];

describe('aiCalling statusRuleEngine', () => {
  it('qualifies when a configured rule matches', () => {
    const out = evaluateOutcome({ statusRules: rules, answers: { active: true, interest: 'yes' }, disposition: 'answered_completed' });
    expect(out).toMatchObject({ qualification: 'qualified', action: 'mark_qualified', ruleId: 'rule_qualified' });
  });

  it('a completed call with no matching rule only records contact — never qualifies', () => {
    const out = evaluateOutcome({ statusRules: rules, answers: { active: true, interest: 'maybe' }, disposition: 'answered_completed' });
    expect(out.qualification).toBe('none');
    expect(out.action).toBe('mark_contacted');
  });

  it('incomplete required answers force review, never qualification', () => {
    const out = evaluateOutcome({ statusRules: rules, answers: { active: true, interest: 'yes' }, disposition: 'answered_partial', hasUnresolvedRequired: true });
    expect(out).toMatchObject({ qualification: 'review', action: 'request_review', requiresReview: true });
  });

  it('do-not-contact overrides every content rule', () => {
    const out = evaluateOutcome({ statusRules: rules, answers: { active: true, interest: 'yes' }, disposition: 'do_not_contact' });
    expect(out).toMatchObject({ qualification: 'do_not_contact', action: 'mark_do_not_contact' });
  });

  it('callback disposition schedules a callback with the captured time', () => {
    const out = evaluateOutcome({ statusRules: rules, answers: {}, disposition: 'callback_requested', control: { callbackRequestedAt: 'Tuesday 2pm', callbackText: 'call me then' } });
    expect(out.action).toBe('schedule_callback');
    expect(out.callback).toEqual({ requestedAt: 'Tuesday 2pm', note: 'call me then' });
  });

  it('no-answer / busy / failed are not business verdicts', () => {
    for (const d of ['no_answer', 'busy', 'voicemail', 'failed']) {
      const out = evaluateOutcome({ statusRules: rules, answers: {}, disposition: d });
      expect(out.action).toBe('none');
      expect(out.qualification).toBe('none');
    }
  });

  it('a rule flagged requiresReview routes to review instead of applying the status', () => {
    const reviewRules = [{ id: 'r1', when: { all: [{ field: 'x', equals: 1 }] }, action: 'mark_qualified', requiresReview: true }];
    const out = evaluateOutcome({ statusRules: reviewRules, answers: { x: 1 }, disposition: 'answered_completed' });
    expect(out).toMatchObject({ qualification: 'review', action: 'request_review', requiresReview: true });
  });

  it('polite decline without a rule is unqualified — not "closed/lost"', () => {
    const out = evaluateOutcome({ statusRules: [], answers: {}, disposition: 'declined' });
    expect(out).toMatchObject({ qualification: 'unqualified', action: 'mark_not_interested' });
  });
});
