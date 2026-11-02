import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionToInstruction, answerResultInstruction } from '../src/toolApi.js';

const question = {
  fieldKey: 'dob', text: 'What is your date of birth?', type: 'short_text', answerType: 'date',
  description: 'Collect day, month and year.',
  answerHint: 'Please give your birth day, month, and full four-digit year. Do not guess a missing year.',
};

test('spoken steps use the conversation language while preserving CRM field keys and choice values', () => {
  assert.match(actionToInstruction({ type: 'disclose' }), /disclosure .*in the conversation language/);
  const instruction = actionToInstruction({ type: 'ask', question: {
    fieldKey: 'interest', text: 'Are you interested?', type: 'single_choice', options: ['interested', 'not_interested'],
  } });
  assert.match(instruction, /current conversation language/);
  assert.match(instruction, /fieldKey="interest"/);
  assert.match(instruction, /written exactly as one of: interested \| not_interested/);
});

test('a rejected answer tells the agent it was not saved and keeps the same question', () => {
  const result = { accepted: false, validation: 'invalid', reason: 'birth_year_required', nextAction: { type: 'clarify', reason: 'birth_year_required', question } };
  const instruction = answerResultInstruction(result, actionToInstruction(result.nextAction));
  assert.match(instruction, /Answer rejected/);
  assert.match(instruction, /No valid answer was saved/);
  assert.match(instruction, /birth_year_required/);
  assert.match(instruction, /full four-digit year/);
  assert.match(instruction, /WAIT for a new reply/);
  assert.match(instruction, /only call record_answer with fieldKey="dob"/);
});

test('both initial questions and follow-ups include the configured answer guidance', () => {
  for (const type of ['ask', 'clarify']) {
    const instruction = actionToInstruction({ type, question });
    assert.match(instruction, /Collect day, month and year/);
    assert.match(instruction, /no_response/);
    assert.match(instruction, /unrelated, incomplete or unintelligible/);
  }
});

test('unknown is kept distinct from a validated answer and retry exhaustion', () => {
  assert.match(answerResultInstruction({ validation: 'unknown' }, 'next'), /Marked unanswered/);
  assert.match(answerResultInstruction({ validation: 'valid' }, 'next'), /validated and saved/);
  const result = answerResultInstruction({ validation: 'invalid' }, actionToInstruction({ type: 'finish' }));
  assert.match(result, /Missing answers remain unanswered and may need review/);
  assert.doesNotMatch(result, /validated and saved/);
});

test('spoken dates reach deterministic validation as digits without inventing missing components', () => {
  const instruction = actionToInstruction({ type: 'ask', question });
  assert.match(instruction, /YYYY-MM-DD/);
  assert.match(instruction, /converting spoken date words in any language to digits/);
  assert.match(instruction, /Never invent a missing component/);
});

test('spelled contact details can span utterances without losing the letters already heard', () => {
  for (const type of ['phone', 'email']) {
    const instruction = actionToInstruction({ type: 'clarify', question: { ...question, type, answerType: type } });
    assert.match(instruction, /over several utterances/);
    assert.match(instruction, /Keep the letters or digits already heard/);
    assert.match(instruction, /ask only for missing or unclear parts/);
    assert.match(instruction, /never fill missing characters/);
  }
});
