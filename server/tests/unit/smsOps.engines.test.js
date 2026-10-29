import { describe, expect, it } from '@jest/globals';
import { extractAnswers, segmentReply, applyRecordedExtras } from '../../src/modules/simSms/engine/multiAnswer.js';
import {
  detectLanguage, detectIntents, parseCallbackTime, replyInsights, conversationInsightsSummary,
} from '../../src/modules/simSms/engine/smsInsights.js';
import { deriveHealth, compareVersions, maskNumber } from '../../src/modules/simSms/engine/deviceHealth.js';
import {
  evaluateLimits, normalizePolicy, quietHoursState, limitConditions,
} from '../../src/modules/contactPolicy/contactPolicy.engine.js';
import * as engine from '../../src/modules/aiCalling/engine/questionEngine.js';

/** Pure engines of the SMS-ops features: multi-answer, insights, device health, contact policy. */
const questionnaire = { questions: [
  { fieldKey: 'interest', label: 'Interest level', text: 'How interested are you?', type: 'single_choice', order: 1, options: ['high', 'medium', 'low', 'none'] },
  { fieldKey: 'budget', label: 'Budget', text: 'What budget in CHF?', type: 'currency', order: 2 },
  { fieldKey: 'hasOven', label: 'Has oven', text: 'Do you have an oven?', type: 'boolean', order: 3 },
  { fieldKey: 'email', label: 'Email', text: 'Your email?', type: 'email', order: 4 },
] };
const fresh = () => engine.markDisclosed(engine.initConversationState());
async function run(text, state = fresh(), classify = null) {
  const action = engine.nextAction(questionnaire, state);
  return extractAnswers({ questionnaire, state, action, question: action.question, text, classify, now: new Date('2026-10-29T08:00:00Z'), timezone: 'Asia/Karachi' });
}
const summary = (r) => r.extras.map((e) => [e.fieldKey, e.value, e.decision]);

describe('multi-answer extraction', () => {
  it('maps numbered answers to the open question and the next ones', async () => {
    const r = await run('1) high 2) 5000');
    expect(r.primary).toMatchObject({ intent: 'answer', normalizedValue: 'high' });
    expect(summary(r)).toEqual([['budget', 5000, 'record']]);
  });

  it('records keyword-evidenced answers and e-mails; leaves the agent past them (no re-asking)', async () => {
    const r = await run('medium. our budget is 3000. ali@example.com');
    expect(r.primary.normalizedValue).toBe('medium');
    expect(summary(r)).toEqual([['budget', 3000, 'record'], ['email', 'ali@example.com', 'record']]);
    let state = engine.applyAnswer(fresh(), 'interest', { validation: 'valid', normalizedValue: 'medium', rawAnswer: 'medium' });
    state = applyRecordedExtras(state, r.extras, engine.applyAnswer);
    expect(engine.nextAction(questionnaire, state).question.fieldKey).toBe('hasOven');
  });

  it('sends an un-labelled number to review instead of assuming it', async () => {
    const r = await run('high, 5000');
    expect(summary(r)).toEqual([['budget', 5000, 'review']]);
    expect(r.extras[0].reason).toBe('no_question_keyword');
  });

  it('a single answer to the open question never also answers another question', async () => {
    const r = await run('high');
    expect(r.primary.normalizedValue).toBe('high');
    expect(r.extras).toEqual([]);
  });

  it('two different values for the open question → nothing assumed, review', async () => {
    const state = engine.applyAnswer(fresh(), 'interest', { validation: 'valid', normalizedValue: 'high', rawAnswer: 'high' });
    const r = await run('budget 4000, budget 5000', state);
    expect(r.primary.intent).toBe('unclear');
    expect(r.extras.find((e) => e.fieldKey === 'budget')).toMatchObject({ decision: 'review', reason: 'conflicting_values' });
  });

  it('accepts LLM mappings only with a verbatim quote and a valid value, and always as review', async () => {
    const classify = async (system) => (system.includes('map ONE SMS reply')
      ? { answers: [
        { fieldKey: 'email', value: 'x@y.com', quote: 'write to x@y.com' }, // not verbatim
        { fieldKey: 'budget', value: '7000', quote: 'seven thousand' },
      ] }
      : { intent: 'unclear', value: null });
    const r = await run('high. Around seven thousand francs', fresh(), classify);
    expect(r.extras).toEqual([expect.objectContaining({ fieldKey: 'budget', value: 7000, decision: 'review', source: 'ai_proposed', evidence: 'seven thousand' })]);
  });

  it('detects callbacks and refusals deterministically (English, Roman Urdu, Urdu)', async () => {
    expect((await run('kal 5 baje call karein')).primary.intent).toBe('callback');
    expect((await run('please call me tomorrow')).primary.intent).toBe('callback');
    expect((await run('مجھے کل کال کریں')).primary.intent).toBe('callback');
    expect((await run('nahi chahiye')).primary.intent).toBe('decline');
    expect((await run('not interested')).primary.intent).toBe('decline');
  });

  it('keeps STOP keyword-only', async () => {
    expect((await run('STOP')).primary.intent).toBe('stop');
    expect((await run('stop calling me at 5 baje')).primary.intent).not.toBe('stop');
  });

  it('answers a yes/no open question in Urdu script and Roman Urdu', async () => {
    let state = engine.applyAnswer(fresh(), 'interest', { validation: 'valid', normalizedValue: 'high', rawAnswer: 'high' });
    state = engine.applyAnswer(state, 'budget', { validation: 'valid', normalizedValue: 1, rawAnswer: '1' });
    expect((await run('جی ہاں', state)).primary).toMatchObject({ intent: 'answer', normalizedValue: true });
    expect((await run('ji nahi', state)).primary).toMatchObject({ intent: 'answer', normalizedValue: false });
    expect((await run('haan, kal 5 baje call karein', state)).primary).toMatchObject({ intent: 'answer', normalizedValue: true });
  });

  it('segments numbered replies only when numbering is sequential', () => {
    expect(segmentReply('1) high 2) 5000').numbered).toBe(true);
    expect(segmentReply('we have 2 ovens, budget 3000').numbered).toBe(false);
  });
});

describe('SMS insights', () => {
  it('detects language', () => {
    expect(detectLanguage('جی ہاں بالکل')).toBe('ur');
    expect(detectLanguage('haan ji, kal baat karte hain')).toBe('roman-ur');
    expect(detectLanguage('yes please call me tomorrow')).toBe('en');
    expect(detectLanguage('ok جی ہاں please call')).toBe('mixed');
  });

  it('quotes evidence verbatim for every intent', () => {
    for (const text of ['Please call me tomorrow', 'baad mein call karein', 'نہیں چاہیے', 'What is the price?', 'tell me more']) {
      for (const { evidence } of detectIntents(text)) expect(text.includes(evidence)).toBe(true);
    }
    expect(detectIntents('not interested').map((i) => i.intent)).toEqual(['not_interested']);
    expect(detectIntents('kya price hai?').map((i) => i.intent)).toEqual(['question']);
  });

  it('parses explicit callback times in the lead timezone and never invents one', () => {
    const now = new Date('2026-10-29T08:00:00Z'); // 13:00 in Karachi
    expect(parseCallbackTime('call me tomorrow at 5pm', { now, timezone: 'Asia/Karachi' }).at.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(parseCallbackTime('kal shaam 5 baje', { now, timezone: 'Asia/Karachi' }).at.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(parseCallbackTime('کل ۵ بجے کال کریں', { now, timezone: 'Asia/Karachi' }).at.toISOString()).toBe('2026-10-30T12:00:00.000Z');
    expect(parseCallbackTime('call me in 2 hours', { now }).at.toISOString()).toBe('2026-10-29T10:00:00.000Z');
    expect(parseCallbackTime('at 10:30', { now, timezone: 'Asia/Karachi' }).at.toISOString()).toBe('2026-10-30T05:30:00.000Z'); // 10:30 passed today
    expect(parseCallbackTime('baad mein call karein', { now })).toMatchObject({ at: null, needsTime: true });
    expect(parseCallbackTime('call me tomorrow', { now })).toMatchObject({ at: null, needsTime: true });
  });

  it('summarises a conversation', () => {
    const msgs = [{ body: 'kya price hai?' }, { body: 'baad mein call karein' }];
    expect(conversationInsightsSummary(msgs)).toMatchObject({ language: 'roman-ur', intent: 'callback', evidence: 'baad mein call karein' });
    expect(replyInsights('STOP').intent).toBe('stop');
  });
});

describe('device health', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const base = {
    lastHeartbeatAt: new Date(now - 60_000), buildProfile: 'private', simState: 'ready', sims: [{ selected: true }],
    permissions: { sendSms: true, receiveSms: true, readPhoneState: true, postNotifications: true, batteryOptimizationIgnored: true },
    network: { connected: true, airplaneMode: false }, queue: {}, appVersion: '0.1.8',
  };
  it('is online when everything is fine, offline after 10 minutes', () => {
    expect(deriveHealth(base, { now }).status).toBe('online');
    expect(deriveHealth({ ...base, lastHeartbeatAt: new Date(now - 11 * 60_000) }, { now })).toMatchObject({ status: 'offline', online: false });
  });
  it('warns about permissions, battery, unknown results, stale queue and outdated app', () => {
    const h = deriveHealth({
      ...base, permissions: { ...base.permissions, receiveSms: false, batteryOptimizationIgnored: false },
      queue: { unknown: 1, pending: 2 }, last: { leaseAt: new Date(now - 3_600_000) }, appVersion: '0.1.4',
    }, { now, minAppVersion: '0.1.5' });
    expect(h.status).toBe('warning');
    expect(h.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['missing_permission_receive_sms', 'battery_optimization_on', 'unknown_results_pending', 'stale_queue', 'outdated_app']));
  });
  it('flags airplane mode / no SIM as critical', () => {
    const h = deriveHealth({ ...base, simState: 'absent', network: { airplaneMode: true } }, { now });
    expect(h.reasons.filter((r) => r.severity === 'critical').map((r) => r.code)).toEqual(['no_sim', 'airplane_mode']);
  });
  it('compares versions and masks numbers', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBe(1);
    expect(maskNumber('+92 327 7220305')).toBe('•••• 0305');
  });
});

describe('contact policy engine', () => {
  const policy = normalizePolicy({ enabled: true, maxTouchesPerDay: 2, maxTouchesPerWeek: 3, minGapMinutes: 30, channels: { sms: { perDay: 1, perWeek: 5 } }, quietHours: { enabled: true, start: '20:00', end: '08:00' } });
  const now = new Date('2026-10-29T10:00:00Z');
  const ago = (min, channel = 'voice') => ({ channel, at: new Date(now - min * 60_000) });

  it('no settings document → disabled (legacy behaviour)', () => {
    expect(normalizePolicy(null).enabled).toBe(false);
    expect(evaluateLimits(normalizePolicy(null), [ago(1), ago(2), ago(3)], 'voice', now).allowed).toBe(true);
  });
  it('enforces min gap, daily, weekly and per-channel limits with next allowed time', () => {
    expect(evaluateLimits(policy, [ago(10)], 'voice', now)).toMatchObject({ allowed: false, reason: 'min_gap', nextAllowedAt: new Date(now.getTime() + 20 * 60_000) });
    expect(evaluateLimits(policy, [ago(60, 'sms')], 'sms', now)).toMatchObject({ allowed: false, reason: 'channel_daily_limit' });
    expect(evaluateLimits(policy, [ago(60, 'sms')], 'voice', now).allowed).toBe(true);
    expect(evaluateLimits(policy, [ago(60), ago(120)], 'voice', now).reason).toBe('daily_limit');
    expect(evaluateLimits(policy, [ago(60), ago(2 * 24 * 60), ago(3 * 24 * 60)], 'voice', now).reason).toBe('weekly_limit');
  });
  it('evaluates quiet hours in the lead timezone', () => {
    const night = new Date('2026-10-29T17:00:00Z'); // 22:00 Karachi
    const q = quietHoursState(policy, 'Asia/Karachi', night);
    expect(q).toMatchObject({ applies: true, quiet: true });
    expect(q.until.toISOString()).toBe('2026-10-30T03:00:00.000Z'); // 08:00 Karachi
    expect(quietHoursState(policy, null, night)).toMatchObject({ applies: false, unknownTimezone: true });
  });
  it('builds atomic $expr conditions only for configured limits', () => {
    expect(limitConditions(normalizePolicy(null), 'sms', now)).toEqual([]);
    expect(limitConditions(policy, 'sms', now)).toHaveLength(5);
  });
});
