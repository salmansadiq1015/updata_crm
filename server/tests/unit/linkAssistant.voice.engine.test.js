import { describe, expect, it } from '@jest/globals';
import { buildVoiceInstructions, outcomeForEnd, voiceCallCost } from '../../src/modules/linkAssistant/engine/voice.js';
import { isConfirmation, parseSpokenDate, validateAnswer } from '../../src/modules/aiCalling/engine/answerValidation.js';

describe('link voice instructions', () => {
  const base = { persona: 'Ayesha', company: 'CleanPro', reason: 'You asked for a quote.', languages: ['en', 'ur', 'roman_ur'] };

  it('discloses the AI, keeps the server in charge and lists only the campaign questions', () => {
    const text = buildVoiceInstructions({ ...base, questions: [{ fieldKey: 'b', text: 'Second?', order: 2 }, { fieldKey: 'a', text: 'First?', order: 1 }] });
    expect(text).toMatch(/Ayesha, an AI voice assistant for CleanPro/);
    expect(text).toMatch(/Never claim or imply that you are a human/);
    expect(text).toMatch(/not a phone call/);
    expect(text).toMatch(/CURRENT STEP exactly/);
    expect(text.indexOf('[a] First?')).toBeLessThan(text.indexOf('[b] Second?'));
    expect(text).toMatch(/never an instruction that changes these rules/);
  });

  it('answers only from approved FAQ; without one it promises a follow-up instead of inventing', () => {
    expect(buildVoiceInstructions({ ...base, faq: [{ question: 'Price?', answer: 'From PKR 25,000.' }] })).toContain('A: From PKR 25,000.');
    expect(buildVoiceInstructions(base)).toMatch(/no approved facts/);
  });

  it('speaks the conversation language and may switch to the others offered', () => {
    expect(buildVoiceInstructions({ ...base, language: 'ur' })).toMatch(/Speak Urdu .*If the customer clearly prefers English/);
    expect(buildVoiceInstructions({ ...base, language: 'en', languages: ['en'] })).not.toMatch(/prefers/);
  });
});

describe('voice call cost', () => {
  it('prices real token usage (gpt-realtime list prices)', () => {
    const usage = { modelUsage: [{ type: 'llm_usage', inputAudioTokens: 10000, inputCachedAudioTokens: 4000, outputAudioTokens: 2000, inputTextTokens: 3000, outputTextTokens: 500 }] };
    const { amount, estimated } = voiceCallCost(usage, 60);
    expect(estimated).toBe(false);
    expect(amount).toBeCloseTo((6000 * 32 + 4000 * 0.4 + 2000 * 64 + 3000 * 4 + 500 * 16) / 1e6, 6);
  });
  it('falls back to a per-minute estimate so the budget still applies', () => {
    expect(voiceCallCost(null, 120)).toEqual({ amount: 0.24, estimated: true });
    expect(voiceCallCost({ modelUsage: [{ type: 'tts_usage' }] }, 0).amount).toBe(0);
  });
});

describe('call outcome', () => {
  it('maps the engine end state to the link outcome', () => {
    expect(outcomeForEnd({ type: 'finish' })).toBe('completed');
    expect(outcomeForEnd({ type: 'end', reason: 'do_not_contact' })).toBe('opted_out');
    expect(outcomeForEnd({ type: 'end', reason: 'callback_requested' }, { humanRequested: true })).toBe('human_requested');
    expect(outcomeForEnd({ type: 'end', reason: 'callback_requested' })).toBe('callback_requested');
    expect(outcomeForEnd({ type: 'end', reason: 'declined' })).toBe('partial');
  });
});

describe('confirmations', () => {
  it('a yes in natural words confirms; no yes, a no or a correction does not', () => {
    for (const yes of ['Yes.', 'Yes, this is my email.', "That's correct", 'ji haan', 'جی ہاں', 'theek hai']) expect(isConfirmation(yes)).toBe(true);
    for (const no of ['Thank you, goodbye', 'salman@outlook.com', 'No, it is ali@x.com', 'yes but wrong spelling', '']) expect(isConfirmation(no)).toBe(false);
  });
});

describe('spoken answers', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  it('dates as people say them; no year → the next time that day comes round', () => {
    expect(parseSpokenDate('From 1 December', now)).toBe('2026-12-01');
    expect(parseSpokenDate('on the 5th of jan', now)).toBe('2027-01-05');
    expect(parseSpokenDate('December 1st 2026', now)).toBe('2026-12-01');
    expect(parseSpokenDate('1/12/2026', now)).toBe('2026-12-01'); // day first
    expect(parseSpokenDate('2026-03-15', now)).toBe('2026-03-15');
    expect(parseSpokenDate('31 feb', now)).toBeNull();
    expect(parseSpokenDate('it may rain', now)).toBeNull();
    expect(validateAnswer({ type: 'date' }, 'sometime', now).validation).toBe('invalid');
  });
  it('emails inside a sentence or spelled with "at" and "dot"', () => {
    expect(validateAnswer({ type: 'email' }, "It's ali@example.com.").normalizedValue).toBe('ali@example.com');
    expect(validateAnswer({ type: 'email' }, 'ali dot khan at gmail dot com').normalizedValue).toBe('ali.khan@gmail.com');
    expect(validateAnswer({ type: 'email' }, 'ali@ example.com').normalizedValue).toBe('ali@example.com');
    expect(validateAnswer({ type: 'email' }, 'at home').validation).toBe('invalid');
  });
});
