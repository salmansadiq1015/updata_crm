import { describe, expect, it } from '@jest/globals';
import {
  initConversationState, nextAction, applyAnswer, markDisclosed, markConfirmed,
  endConversation, conditionMet, eligibleQuestions, unresolvedRequired, progress,
} from '../../src/modules/aiCalling/engine/questionEngine.js';

const questionnaire = {
  questions: [
    { fieldKey: 'active', text: 'Are you operating?', type: 'boolean', required: true, order: 1 },
    { fieldKey: 'employees', text: 'How many employees?', type: 'integer', required: true, order: 2, min: 1,
      condition: { all: [{ field: 'active', equals: true }] } },
    { fieldKey: 'interest', text: 'Interested in a follow-up?', type: 'single_choice', required: true, order: 3,
      options: ['yes', 'no', 'later'], confirmCritical: true },
  ],
};

describe('aiCalling questionEngine', () => {
  it('discloses before anything else', () => {
    const s = initConversationState();
    expect(nextAction(questionnaire, s)).toEqual({ type: 'disclose' });
  });

  it('asks questions in order and skips conditionally-hidden ones', () => {
    let s = markDisclosed(initConversationState());
    expect(nextAction(questionnaire, s).question.fieldKey).toBe('active');

    // Answer active=false → employees (conditioned on active=true) is skipped.
    s = applyAnswer(s, 'active', { validation: 'valid', normalizedValue: false, rawAnswer: 'no' });
    expect(nextAction(questionnaire, s).question.fieldKey).toBe('interest');

    // When active=true, employees becomes eligible.
    s = applyAnswer(s, 'active', { validation: 'valid', normalizedValue: true, rawAnswer: 'yes' });
    expect(nextAction(questionnaire, s).question.fieldKey).toBe('employees');
  });

  it('clarifies up to maxClarifications then moves on', () => {
    let s = markDisclosed(initConversationState());
    s = applyAnswer(s, 'active', { validation: 'valid', normalizedValue: true });
    // default maxClarifications = 2
    s = applyAnswer(s, 'employees', { validation: 'invalid', normalizedValue: null });
    expect(nextAction(questionnaire, s).type).toBe('clarify');
    s = applyAnswer(s, 'employees', { validation: 'invalid', normalizedValue: null });
    // clarifications now 2 → give up, advance to next question
    expect(nextAction(questionnaire, s).question.fieldKey).toBe('interest');
  });

  it('confirms a critical answer once, then finishes', () => {
    let s = markDisclosed(initConversationState());
    s = applyAnswer(s, 'active', { validation: 'valid', normalizedValue: true });
    s = applyAnswer(s, 'employees', { validation: 'valid', normalizedValue: 10 });
    s = applyAnswer(s, 'interest', { validation: 'valid', normalizedValue: 'yes' });
    const confirm = nextAction(questionnaire, s);
    expect(confirm.type).toBe('confirm');
    expect(confirm.question.fieldKey).toBe('interest');
    s = markConfirmed(s, 'interest');
    expect(nextAction(questionnaire, s)).toEqual({ type: 'finish' });
  });

  it('ends immediately when the conversation is ended (DNC/decline)', () => {
    let s = markDisclosed(initConversationState());
    s = endConversation(s, 'do_not_contact');
    expect(nextAction(questionnaire, s)).toEqual({ type: 'end', reason: 'do_not_contact' });
  });

  it('reports unresolved required questions and progress', () => {
    let s = markDisclosed(initConversationState());
    s = applyAnswer(s, 'active', { validation: 'valid', normalizedValue: true });
    s = applyAnswer(s, 'employees', { validation: 'unknown', normalizedValue: null });
    // interest still unanswered
    expect(unresolvedRequired(questionnaire, s)).toEqual(['interest']);
    const p = progress(questionnaire, s);
    expect(p.total).toBe(3);
    expect(p.answered).toBe(2); // active(valid) + employees(unknown)
    expect(p.valid).toBe(1);
  });

  it('conditionMet handles all/any/exists/gt', () => {
    const answers = { a: { validation: 'valid', normalizedValue: 5 } };
    expect(conditionMet({ all: [{ field: 'a', gt: 3 }] }, answers)).toBe(true);
    expect(conditionMet({ all: [{ field: 'a', gt: 9 }] }, answers)).toBe(false);
    expect(conditionMet({ any: [{ field: 'b', exists: false }] }, answers)).toBe(true);
    expect(conditionMet(null, answers)).toBe(true);
    expect(eligibleQuestions(questionnaire, {}).map((q) => q.fieldKey)).toEqual(['active', 'interest']);
  });
});
