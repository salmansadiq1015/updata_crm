import { describe, expect, it, jest } from '@jest/globals';
import {
  smsEncoding, smsSegments, isStopRequest, buildMessage, sameNumberTail,
} from '../../src/modules/simSms/engine/smsCopy.js';
import { interpretReply } from '../../src/modules/simSms/engine/replyInterpreter.js';

const interest = { fieldKey: 'interest', label: 'Interest', text: 'How interested are you?', type: 'single_choice', options: ['high', 'low'] };

describe('SMS copy', () => {
  it('counts segments the way carriers bill them', () => {
    expect(smsEncoding('Hello €')).toBe('GSM-7');
    expect(smsSegments('a'.repeat(160))).toBe(1);
    expect(smsSegments('a'.repeat(161))).toBe(2);
    expect(smsSegments('{'.repeat(80))).toBe(1); // extension chars take 2 septets
    expect(smsSegments('{'.repeat(81))).toBe(2);
    expect(smsEncoding('مرحبا')).toBe('UCS-2');
    expect(smsSegments('ü'.repeat(70))).toBe(1);
    expect(smsSegments('ş'.repeat(71))).toBe(2); // ş is not GSM-7 → UCS-2, 67 per part
  });

  it('treats only a bare opt-out keyword as STOP (multilingual, case/diacritics-insensitive)', () => {
    for (const t of ['STOP', ' stop. ', 'Stopp', 'ARRÊT', 'unsubscribe', 'توقف']) expect(isStopRequest(t)).toBe(true);
    for (const t of ['stop by tomorrow?', 'non-stop interest', '', 'high']) expect(isStopRequest(t)).toBe(false);
  });

  it('opening identifies the sender, offers STOP and asks the first question with options', () => {
    const body = buildMessage({ kind: 'opening', agent: { agentName: 'Mia', organizationName: 'Acme' }, lead: { name: 'Bäckerei Huber' }, question: interest });
    expect(body).toBe('Hello Bäckerei Huber, this is Mia from Acme (automated assistant). Reply STOP to opt out. How interested are you? (high / low)');
    expect(buildMessage({ kind: 'opening', agent: { agentName: 'Mia', organizationName: 'Acme' }, question: interest })).toMatch(/^Hello, this is Mia/);
  });

  it('matches numbers regardless of formatting / country prefix', () => {
    expect(sameNumberTail('+41 79 555 10 01', '0795551001')).toBe(true);
    expect(sameNumberTail('+41795551001', '+41795551002')).toBe(false);
  });
});

describe('reply interpretation', () => {
  it('deterministic answers never call the model', async () => {
    const classify = jest.fn();
    expect(await interpretReply(interest, 'High', { classify })).toMatchObject({ intent: 'answer', normalizedValue: 'high', source: 'deterministic' });
    expect(await interpretReply(interest, "don't know", { classify })).toMatchObject({ intent: 'unknown' });
    expect(classify).not.toHaveBeenCalled();
  });

  it('STOP is keyword-only and wins over everything', async () => {
    const classify = jest.fn();
    expect((await interpretReply(interest, 'STOP', { classify })).intent).toBe('stop');
    expect(classify).not.toHaveBeenCalled();
  });

  it('a model value is accepted only if the deterministic validator accepts it', async () => {
    expect(await interpretReply(interest, 'super keen tbh', { classify: async () => ({ intent: 'answer', value: 'high' }) }))
      .toMatchObject({ intent: 'answer', normalizedValue: 'high', source: 'ai_interpreted_validated' });
    expect(await interpretReply(interest, 'super keen tbh', { classify: async () => ({ intent: 'answer', value: 'enormous' }) }))
      .toMatchObject({ intent: 'unclear' });
    // A model cannot opt someone out, and errors degrade to "unclear".
    expect((await interpretReply(interest, 'meh', { classify: async () => ({ intent: 'stop' }) })).intent).toBe('unclear');
    expect((await interpretReply(interest, 'meh', { classify: async () => { throw new Error('down'); } })).intent).toBe('unclear');
  });

  it('decline / callback intents are passed through', async () => {
    expect((await interpretReply(interest, 'call me next week', { classify: async () => ({ intent: 'callback', value: null }) })).intent).toBe('callback');
    expect((await interpretReply(interest, 'no thanks', { classify: async () => ({ intent: 'decline', value: null }) })).intent).toBe('decline');
  });
});
