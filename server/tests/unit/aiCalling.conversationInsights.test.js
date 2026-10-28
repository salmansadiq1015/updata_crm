import { describe, expect, it } from '@jest/globals';
import { conversationInsights } from '../../src/modules/aiCalling/engine/conversationInsights.js';

const questionnaire = { questions: [
  { fieldKey: 'need', label: 'Need', text: 'What do you need?', required: true, order: 1 },
  { fieldKey: 'budget', label: 'Budget', text: 'What is the budget?', required: true, confirmCritical: true, order: 2 },
  { fieldKey: 'timing', label: 'Timing', text: 'When?', required: true, order: 3 },
  { fieldKey: 'office', label: 'Office', text: 'Which office?', condition: { all: [{ field: 'need', equals: 'office' }] }, order: 4 },
] };
const valid = value => ({ validation: 'valid', normalizedValue: value, rawAnswer: String(value), confirmed: false });

describe('question coverage and recorded conversation insights', () => {
  it('accounts for every question without inventing missing answers or treating unknown as complete', () => {
    const result = conversationInsights({ questionnaire, state: { answers: { need: valid('home'), budget: { validation: 'unknown' } } }, terminal: true });
    expect(result.questionCoverage.questions.map(q => q.status)).toEqual(['answered', 'unknown', 'not_answered', 'not_applicable']);
    expect(result.questionCoverage).toMatchObject({ total: 4, applicable: 3, answered: 1, unknown: 1, unanswered: 1, requiredGaps: ['budget', 'timing'] });
    expect(result.conversationInsights.intent).toBe('not_established');
    expect(result.conversationInsights.nextSteps[0]).toMatch(/2 required/);
  });

  it('uses human-reviewed answers for conditions and marks critical confirmation gaps', () => {
    const result = conversationInsights({ questionnaire, state: { answers: { need: valid('home'), budget: valid(20000) } }, answers: [{ questionFieldKey: 'need', ...valid('office'), source: 'human_review' }] });
    expect(result.questionCoverage.questions[0].source).toBe('human_review');
    expect(result.questionCoverage.questions.map(q => q.status)).toEqual(['answered', 'needs_confirmation', 'pending', 'pending']);
    expect(result.conversationInsights.observations).toEqual([expect.objectContaining({ code: 'confirmation_needed' })]);
  });

  it('retains answers to a conditionally excluded question without counting them as applicable', () => {
    const result = conversationInsights({ questionnaire, state: { answers: { need: valid('home'), office: valid('Second floor') } } });
    expect(result.questionCoverage.questions[3]).toMatchObject({ eligible: false, rawAnswer: 'Second floor' });
    expect(result.questionCoverage.answered).toBe(1);
  });

  it('suppression takes priority over callback requests and never recommends sales follow-up', () => {
    const result = conversationInsights({ questionnaire, state: { endedReason: 'do_not_contact', control: { humanRequested: true, callbackText: 'Tomorrow' } }, terminal: true, incomplete: true });
    expect(result.conversationInsights.intent).toBe('do_not_contact');
    expect(result.conversationInsights.nextSteps).toEqual(['Keep the lead suppressed. Do not schedule sales follow-ups.']);
  });

  it('describes explicit requests and participation without pretending to infer emotion or interest', () => {
    const result = conversationInsights({ state: { endedReason: 'callback_requested', control: { callbackText: 'After 4pm' } }, transcript: [{ role: 'assistant', interrupted: true }, { role: 'customer' }] });
    expect(result.conversationInsights).toMatchObject({ intent: 'callback_requested', participation: { agentTurns: 1, leadTurns: 1, interruptedAgentTurns: 1 } });
    expect(result.conversationInsights.observations[0].evidence).toBe('After 4pm');
    expect(result.conversationInsights).not.toHaveProperty('sentiment');
    expect(conversationInsights({}).questionCoverage.questions).toEqual([]);
  });
});
