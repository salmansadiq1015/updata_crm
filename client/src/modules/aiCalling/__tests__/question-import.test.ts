import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { EXAMPLE, buildAiPrompt, DEFAULT_PROMPT_PARAMS, parseQuestionText, serializeQuestions } from '../question-import';
import type { Question } from '../types/ai-calling-types';

describe('question import format', () => {
  it('parses the documented example into valid questions, conditions and rules', () => {
    const r = parseQuestionText(EXAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.questions.map(q => [q.fieldKey, q.type, q.required])).toEqual([
      ['decision_maker', 'boolean', true], ['company_size', 'integer', true], ['main_goal', 'single_choice', false], ['budget', 'currency', false],
    ]);
    expect(r.questions[1].min).toBe(1);
    expect(r.questions[2].options).toEqual(['more leads', 'better follow-up', 'reporting']);
    expect(r.questions[3].condition).toEqual({ all: [{ field: 'decision_maker', equals: true }] });
    expect(r.questions[3].description).toBe('Accept a range and record the lower number.');
    expect(r.rules).toEqual([
      expect.objectContaining({ action: 'mark_qualified', requiresReview: false, when: { all: [{ field: 'decision_maker', equals: true }, { field: 'company_size', gte: 5 }] } }),
      expect.objectContaining({ action: 'mark_not_interested', requiresReview: true, when: { all: [{ field: 'main_goal', equals: 'reporting' }] } }),
    ]);
    if (process.env.QUESTION_IMPORT_DUMP) writeFileSync(process.env.QUESTION_IMPORT_DUMP, JSON.stringify(r));
  });

  it('accepts a plain numbered list and Q/A pairs, inferring types and keys', () => {
    const r = parseQuestionText(`1. What is your full name?\n2. What is your email address?\n3. Do you currently use a CRM?\n\nQ: How many sales staff do you have?\nA: About 5`);
    expect(r.errors).toEqual([]);
    expect(r.questions.map(q => q.type)).toEqual(['short_text', 'email', 'boolean', 'integer']);
    expect(r.questions[0].fieldKey).toBe('what_is_your_full_name');
    expect(r.questions[3].description).toBe('Expected answer: About 5');
    expect(r.warnings.length).toBe(4); // every type was guessed
  });

  it('tolerates chat-style AI replies: code fences, bold keys, headings, aliases, multi-line guidance', () => {
    const r = parseQuestionText('Here you go\n```\n## Questions\n**Q:** Which plan suits you?\n**Type:** choice\nChoices: basic | pro\nGuidance: listen for\nthe plan name\n---\nQ: Best time to call?\nType: Time\nRequired: no\n```');
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]).toMatchObject({ type: 'single_choice', options: ['basic', 'pro'], description: 'listen for the plan name' });
    expect(r.questions[1]).toMatchObject({ type: 'time', required: false });
    const tail = parseQuestionText('Q: Budget?\nType: currency\nRequired: no\n\nLet me know if you want changes!');
    expect(tail.questions[0].required).toBe(false);
    expect(tail.warnings.map(w => w.message)).toContain('Ignored 1 line that is not part of a question (for example an introduction from the AI).');
  });

  it('reports what the server would reject, with the question and line', () => {
    const r = parseQuestionText('Q: Pick one\nType: single_choice\n---\nQ: Size?\nType: huge\n---\nQ: Budget?\nType: currency\nAsk if: later_field = yes\n---\nType: email');
    expect(r.questions).toHaveLength(0);
    expect(r.errors.map(e => e.message)).toEqual([
      expect.stringMatching(/Question 1 .*needs Options/),
      expect.stringMatching(/Question 2 .*unknown type "huge"/),
      expect.stringMatching(/Question 3 .*"later_field" is not an earlier question/),
      expect.stringMatching(/Question 4 .*missing the question text/),
    ]);
  });

  it('appends without key collisions, references existing questions, and enforces the 40-question limit', () => {
    const existing: Question[] = [{ fieldKey: 'interest', label: 'Interest', text: 'Interested?', type: 'boolean', required: true }];
    const r = parseQuestionText('Q: Interest level?\nLabel: Interest\nType: rating\nAsk if: interest = yes', { existing, mode: 'append' });
    expect(r.errors).toEqual([]);
    expect(r.questions[0]).toMatchObject({ fieldKey: 'interest_2', order: 2, condition: { all: [{ field: 'interest', equals: true }] } });
    const many = Array.from({ length: 41 }, (_, i) => `${i + 1}. Question number ${i + 1}?`).join('\n');
    expect(parseQuestionText(many).errors.at(-1)?.message).toMatch(/at most 40/);
    expect(parseQuestionText('Q: Dup?\nKey: interest', { existing, mode: 'append' }).errors[0].message).toMatch(/already used/);
  });

  it('parses "or" conditions, numeric comparisons and in-lists; rejects mixed and/or', () => {
    const base = 'Q: Size?\nKey: size\nType: integer\n---\nQ: Region?\nKey: region\nType: single_choice\nOptions: north, south, east\n---\n';
    const r = parseQuestionText(`${base}Q: Why?\nAsk if: size > 10 or region in north | south`);
    expect(r.questions[2].condition).toEqual({ any: [{ field: 'size', gt: 10 }, { field: 'region', in: ['north', 'south'] }] });
    expect(parseQuestionText(`${base}Q: Why?\nAsk if: size > 1 and region = north or size < 3`).errors[0].message).toMatch(/either "and" or "or"/);
  });

  it('round-trips the current questions and rules through the text format', () => {
    const first = parseQuestionText(EXAMPLE);
    const again = parseQuestionText(serializeQuestions(first.questions, first.rules));
    expect(again.errors).toEqual([]);
    expect(again.questions).toEqual(first.questions);
    expect(again.rules.map(r => [r.action, r.when, r.requiresReview])).toEqual(first.rules.map(r => [r.action, r.when, r.requiresReview]));
  });

  it('builds a prompt with the user parameters, placeholders for blanks, and the exact format', () => {
    const p = buildAiPrompt({ ...DEFAULT_PROMPT_PARAMS, company: 'Updata', count: 99, language: 'Urdu' });
    expect(p).toContain('Company: Updata');
    expect(p).toContain('[WHAT YOU SELL OR DO]');
    expect(p).toContain('Write 40 questions');
    expect(p).toContain('Write Q, Label, Options and Guidance in Urdu');
    expect(p).toContain('Rule:');
    expect(buildAiPrompt({ ...DEFAULT_PROMPT_PARAMS, includeRules: false })).not.toContain('add 1 to 3 "Rule:" lines');
  });
});
