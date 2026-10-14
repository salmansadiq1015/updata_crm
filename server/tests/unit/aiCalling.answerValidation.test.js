import { describe, expect, it } from '@jest/globals';
import { validateAnswer } from '../../src/modules/aiCalling/engine/answerValidation.js';

describe('aiCalling answerValidation', () => {
  it('parses yes/no for boolean and rejects ambiguous', () => {
    expect(validateAnswer({ type: 'boolean' }, 'Yeah absolutely')).toEqual({ validation: 'valid', normalizedValue: true });
    expect(validateAnswer({ type: 'boolean' }, 'nope')).toEqual({ validation: 'valid', normalizedValue: false });
    expect(validateAnswer({ type: 'boolean' }, 'maybe later').validation).toBe('invalid');
  });

  it('treats "I don\'t know" as unknown, never an invented value', () => {
    expect(validateAnswer({ type: 'integer' }, "I don't know").validation).toBe('unknown');
    expect(validateAnswer({ type: 'short_text', required: true }, 'no idea').validation).toBe('unknown');
  });

  it('extracts and bounds integers', () => {
    expect(validateAnswer({ type: 'integer', min: 1 }, 'about 25 people')).toEqual({ validation: 'valid', normalizedValue: 25 });
    expect(validateAnswer({ type: 'integer', min: 1 }, 'zero').validation).toBe('invalid'); // below min
    expect(validateAnswer({ type: 'integer' }, 'lots').validation).toBe('invalid');
  });

  it('matches single/multiple choice by value or label', () => {
    const q = { type: 'single_choice', options: [{ value: 'yes', label: 'Interested' }, { value: 'no', label: 'Not interested' }] };
    expect(validateAnswer(q, 'Interested')).toEqual({ validation: 'valid', normalizedValue: 'yes' });
    expect(validateAnswer(q, 'something else').validation).toBe('invalid');
    const mq = { type: 'multiple_choice', options: ['heating', 'cooling', 'plumbing'] };
    expect(validateAnswer(mq, 'heating and plumbing')).toEqual({ validation: 'valid', normalizedValue: ['heating', 'plumbing'] });
  });

  it('validates email / url / phone / rating', () => {
    expect(validateAnswer({ type: 'email' }, 'just some words here').validation).toBe('invalid');
    expect(validateAnswer({ type: 'email' }, 'a@b.co')).toEqual({ validation: 'valid', normalizedValue: 'a@b.co' });
    expect(validateAnswer({ type: 'url' }, 'example.com').normalizedValue).toBe('https://example.com');
    expect(validateAnswer({ type: 'phone' }, '+41 79 123 45 67').validation).toBe('valid');
    expect(validateAnswer({ type: 'rating', max: 5 }, '4 out of 5')).toEqual({ validation: 'valid', normalizedValue: 4 });
    expect(validateAnswer({ type: 'rating', max: 5 }, '9').validation).toBe('invalid');
  });

  it('normalizes dates', () => {
    expect(validateAnswer({ type: 'date' }, '2026-03-15').normalizedValue).toBe('2026-03-15');
    expect(validateAnswer({ type: 'date' }, 'sometime').validation).toBe('invalid');
  });
});
