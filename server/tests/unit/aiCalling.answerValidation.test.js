import { describe, expect, it } from '@jest/globals';
import { answerRequirements, validateAnswer } from '../../src/modules/aiCalling/engine/answerValidation.js';

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

  it('parses numbers in Urdu/Arabic digits, with scale words, and spelled out', () => {
    const n = (text) => validateAnswer({ type: 'currency' }, text).normalizedValue;
    expect(n('۸')).toBe(8);
    expect(n('٨ لوگ')).toBe(8);
    expect(n('30 hazar')).toBe(30000);
    expect(n('2.5 lakh')).toBe(250000);
    expect(n('1 lakh 50 hazar')).toBe(150000);
    expect(n('50k')).toBe(50000);
    expect(n('about 1,200,000')).toBe(1200000);
    expect(n('پچاس ہزار')).toBe(50000);
    expect(n('ڈیڑھ لاکھ')).toBe(150000);
    expect(n('forty thousand')).toBe(40000);
    expect(n('two hundred fifty thousand')).toBe(250000);
    expect(n('do lakh rupay')).toBe(200000);
    // A unit after the number is not a scale; ordinary words are not numbers.
    expect(n('30 km')).toBe(30);
    expect(validateAnswer({ type: 'integer' }, 'I do').validation).toBe('invalid');
    expect(validateAnswer({ type: 'integer' }, 'we have char employees').validation).toBe('invalid');
  });

  it('normalizes dates', () => {
    expect(validateAnswer({ type: 'date' }, '2026-03-15').normalizedValue).toBe('2026-03-15');
    expect(validateAnswer({ type: 'date' }, 'sometime').validation).toBe('invalid');
  });

  describe('question-aware validation for existing text questionnaires', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    const dob = { fieldKey: 'q_7', label: 'Birth date', text: 'What is your date of birth?', type: 'short_text', required: true };

    it.each(['Why are you', 'Nain', 'nine', 'I could not really', 'March 15', '15/03/92', '1992-02-30', '2030-03-15'])(
      'does not accept an irrelevant, incomplete or impossible birth date: %s', (reply) => {
        expect(validateAnswer(dob, reply, now)).toMatchObject({ validation: 'invalid', normalizedValue: null });
      },
    );

    it.each([
      ['I was born on March 15, 1992', '1992-03-15'],
      ['15th of March 1992', '1992-03-15'],
      ['15/03/1992', '1992-03-15'],
      ['۱۹۹۲-۰۳-۱۵', '1992-03-15'],
      ['2000-02-29', '2000-02-29'],
    ])('accepts a complete historical birth date: %s', (reply, normalizedValue) => {
      expect(validateAnswer(dob, reply, now)).toEqual({ validation: 'valid', normalizedValue });
    });

    it('applies birth-date constraints to explicitly typed dates and DOB field keys', () => {
      expect(validateAnswer({ ...dob, type: 'date' }, 'March 15', now).reason).toBe('birth_year_required');
      expect(validateAnswer({ fieldKey: 'dateOfBirth', type: 'short_text' }, '2030-01-01', now).reason).toBe('birth_date_in_future');
      expect(validateAnswer({ type: 'date', text: 'When should we call back?' }, 'December 1', now).normalizedValue).toBe('2026-12-01');
    });

    it('checks complete email and phone details even when configured as text', () => {
      const email = { type: 'short_text', text: 'What is your email address?' };
      const phone = { type: 'short_text', text: 'What is the best phone number to reach you?' };
      expect(validateAnswer(email, 'M-O-E-Z').validation).toBe('invalid');
      expect(validateAnswer(email, '5-9-5-At-B-B-').validation).toBe('invalid');
      expect(validateAnswer(email, 'ali at example dot com').normalizedValue).toBe('ali@example.com');
      expect(validateAnswer(phone, 'Legal team.').validation).toBe('invalid');
      expect(validateAnswer(phone, 'This is my file 353204.').validation).toBe('invalid');
      expect(validateAnswer(phone, '+۹۲ ۳۰۰ ۱۲۳۴۵۶۷').normalizedValue).toBe('+923001234567');
      expect(validateAnswer(phone, '123+4567890').validation).toBe('invalid');
    });

    it('requires a whole number for family size instead of rounding or accepting chatter', () => {
      const family = { type: 'short_text', text: 'How many people are in your immediate family?' };
      expect(validateAnswer(family, 'Thank you for the').validation).toBe('invalid');
      expect(validateAnswer(family, '2.5').reason).toBe('not_a_whole_number');
      expect(validateAnswer(family, 'There are six people').normalizedValue).toBe(6);
    });

    it.each(['Mhm.', 'Continue.', 'Thank you for the', "That's the problem.", 'Why are you asking?', 'Could you repeat that?'])(
      'does not store conversational filler as profile data: %s', (reply) => {
        expect(validateAnswer({ type: 'short_text', text: 'What is your occupation?' }, reply).validation).toBe('invalid');
        expect(validateAnswer({ type: 'address', text: 'What is your address?' }, reply).validation).toBe('invalid');
      },
    );

    it('rejects question echoes while preserving names, professions and locations in different scripts', () => {
      const name = { type: 'short_text', text: 'What is your full name?' };
      expect(validateAnswer(name, 'What is your full name?').reason).toBe('unrelated_answer');
      expect(validateAnswer(name, 'محمد علی').normalizedValue).toBe('محمد علی');
      expect(validateAnswer({ type: 'short_text', text: 'What is your profession?' }, 'I repair elevators').validation).toBe('valid');
      expect(validateAnswer({ type: 'address' }, 'Zürich').validation).toBe('valid');
    });

    it.each(["I don't know", 'I prefer not to share', 'skip this', 'پتہ نہیں'])(
      'honors an explicit unknown or skip without inventing a value: %s', reply => {
        expect(validateAnswer(dob, reply, now)).toEqual({ validation: 'unknown', normalizedValue: null });
      },
    );

    it('does not override explicit field types or infer phone from an email question mentioning contact details', () => {
      expect(answerRequirements({ type: 'boolean', text: 'Can we use your email address?' }).type).toBe('boolean');
      expect(answerRequirements({ type: 'short_text', text: 'Do you prefer email or phone?' }).type).toBe('short_text');
    });
  });

  it('matches whole options and clarifies conflicting single-choice replies', () => {
    const q = { type: 'single_choice', options: ['yes', 'no'] };
    expect(validateAnswer(q, 'yesterday').validation).toBe('invalid');
    expect(validateAnswer(q, 'nobody').validation).toBe('invalid');
    expect(validateAnswer(q, 'yes or no').validation).toBe('invalid');
    expect(validateAnswer(q, 'I said yes').normalizedValue).toBe('yes');
  });
});
