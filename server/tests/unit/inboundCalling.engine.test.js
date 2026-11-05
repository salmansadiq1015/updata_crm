import { describe, expect, it } from '@jest/globals';
import { canTransition, planTransition, deriveOutcome, endStatusFor } from '../../src/modules/inboundCalling/engine/stateMachine.js';
import { decideHandling, withinBusinessHours, agentFor } from '../../src/modules/inboundCalling/engine/ruleEngine.js';
import { parseCallerNumber, classifyMatch } from '../../src/modules/inboundCalling/engine/callerMatch.js';
import { classifyText, resolveIntents } from '../../src/modules/inboundCalling/engine/intents.js';
import { evaluateQualification } from '../../src/modules/inboundCalling/engine/qualification.js';
import { recommend } from '../../src/modules/inboundCalling/engine/recommendations.js';
import { buildReceptionistPrompt, buildGreeting } from '../../src/modules/inboundCalling/engine/receptionistPrompt.js';
import { autoWorkStatus } from '../../src/modules/inboundCalling/engine/workStatus.js';
import { normalizeQuestions, validateAnswer, closingPromptSection, QUESTION_TEMPLATES } from '../../src/modules/inboundCalling/engine/closingQuestions.js';

const agents = new Map([['a1', { availability: 'active' }], ['a2', { availability: 'paused' }]]);
const base = { enabled: true, defaultAgentId: 'a1', answerDelaySeconds: 3, maxConcurrentAiSessions: 1, rules: [], blockedNumbers: [] };
const device = { id: 'd1', simSlot: 0, audioVerified: true };
const caller = { e164: '+41791234567', presentation: 'available' };

describe('inbound state machine', () => {
  it('only allows forward transitions and never leaves a terminal state', () => {
    expect(canTransition('RINGING', 'ANSWERED')).toBe(true);
    expect(canTransition('QUEUED', 'ANSWERED')).toBe(true); // a lost `answering` report must not lose the answer
    expect(canTransition('AI_ACTIVE', 'RINGING')).toBe(false);
    expect(canTransition('COMPLETED', 'AI_ACTIVE')).toBe(false);
    expect(canTransition('MISSED', 'COMPLETED')).toBe(false);
    expect(planTransition('COMPLETED', 'FAILED')).toBeNull();
    expect(planTransition('RINGING', 'MISSED').filter).toEqual({ status: 'RINGING' });
  });

  it('derives outcomes from recorded facts, separate from qualification', () => {
    expect(deriveOutcome({ status: 'COMPLETED', answeredBy: 'ai' })).toBe('handled_by_ai');
    expect(deriveOutcome({ status: 'COMPLETED', answeredBy: 'ai', handedOff: true })).toBe('transferred');
    expect(deriveOutcome({ status: 'MISSED' })).toBe('missed');
    expect(deriveOutcome({ status: 'FAILED', aiConnected: true })).toBe('interrupted');
    expect(endStatusFor('RINGING', { answered: false })).toBe('MISSED');
    expect(endStatusFor('AI_ACTIVE', { answered: true, reason: 'audio_lost' })).toBe('INTERRUPTED');
    expect(endStatusFor('AI_ACTIVE', { answered: true, reason: 'remote_hangup' })).toBe('WRAPPING_UP');
  });
});

describe('inbound rule engine', () => {
  const decide = (settings, extra = {}) => decideHandling({ settings: { ...base, ...settings }, caller, match: { status: 'new' }, device, availability: { agents, activeAiSessions: 0 }, ...extra });

  it('answers with the default agent when enabled', () => {
    const d = decide({});
    expect(d).toMatchObject({ action: 'ai_answer', agentId: 'a1', answerAfterMs: 3000, callerType: 'unknown_number' });
  });

  it('never lets the AI answer a blocked number or a do-not-contact caller, whatever the rules say', () => {
    const rules = [{ id: 'r', name: 'All AI', priority: 1, action: 'ai_answer', conditions: { callerType: 'any' } }];
    expect(decide({ blockedNumbers: [caller.e164], rules }).action).toBe('human');
    expect(decideHandling({ settings: { ...base, rules }, caller, match: { status: 'existing', doNotContact: true }, device, availability: { agents } }).action).toBe('human');
  });

  it('master switch off means no AI, even for a matching ai_answer rule', () => {
    const d = decide({ enabled: false, rules: [{ id: 'r', name: 'x', action: 'ai_answer', conditions: {} }] });
    expect(d.action).toBe('human');
    expect(d.aiBlockedBy).toBe('ai_answering_disabled');
  });

  it('applies rules by priority: one decision only', () => {
    const rules = [
      { id: 'late', name: 'Existing → human', priority: 50, action: 'human', conditions: { callerType: 'existing_lead' } },
      { id: 'first', name: 'VIP → human', priority: 1, action: 'ignore', conditions: { numbers: [caller.e164] } },
    ];
    const d = decideHandling({ settings: { ...base, rules }, caller, match: { status: 'existing' }, device, availability: { agents } });
    expect(d).toMatchObject({ action: 'ignore', ruleId: 'first' });
  });

  it('routes by SIM and falls back when the agent or cap blocks the AI', () => {
    const rules = [{ id: 's2', name: 'SIM 2 agent', action: 'ai_answer', agentId: 'a2', conditions: { simSlots: [1] } }];
    const d = decideHandling({ settings: { ...base, rules }, caller, match: { status: 'new' }, device: { ...device, simSlot: 1 }, availability: { agents } });
    expect(d).toMatchObject({ action: 'human', aiBlockedBy: 'agent_unavailable' });
    expect(decide({}, { availability: { agents, activeAiSessions: 1 } }).aiBlockedBy).toBe('ai_session_limit');
    expect(decide({}, { device: { ...device, audioVerified: false } }).aiBlockedBy).toBe('device_audio_not_verified');
    expect(decide({}, { availability: { agents, voicePaused: true } }).aiBlockedBy).toBe('voice_paused');
  });

  it('respects business hours (overnight windows too) and the per-device agent', () => {
    const hours = { enabled: true, timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
    expect(withinBusinessHours(hours, new Date('2026-11-04T10:00:00Z'))).toBe(true); // Wednesday
    expect(withinBusinessHours(hours, new Date('2026-11-04T18:00:00Z'))).toBe(false);
    expect(withinBusinessHours(hours, new Date('2026-11-08T10:00:00Z'))).toBe(false); // Sunday
    expect(withinBusinessHours({ ...hours, start: '22:00', end: '06:00', days: [3] }, new Date('2026-11-04T23:00:00Z'))).toBe(true);
    const out = decide({ businessHours: hours, outsideHoursAction: 'human' }, { now: new Date('2026-11-04T20:00:00Z') });
    expect(out).toMatchObject({ action: 'human', reason: 'outside_business_hours' });
    expect(agentFor({ defaultAgentId: 'a1', deviceAgents: [{ deviceId: 'd1', simSlot: 1, agentId: 'a2' }] }, { deviceId: 'd1', simSlot: 1 }).agentId).toBe('a2');
    expect(agentFor({ defaultAgentId: 'a1', deviceAgents: [{ deviceId: 'd1', simSlot: null, aiEnabled: false }] }, { deviceId: 'd1', simSlot: 0 }).disabledForDevice).toBe(true);
  });
});

describe('caller identification', () => {
  it('normalises caller ID formats and recognises private numbers', () => {
    expect(parseCallerNumber('079 123 45 67', 'CH').e164).toBe('+41791234567');
    expect(parseCallerNumber('0041791234567', 'CH').e164).toBe('+41791234567');
    expect(parseCallerNumber('03001234567', 'PK').e164).toBe('+923001234567');
    expect(parseCallerNumber('', 'CH').presentation).toBe('private');
    expect(parseCallerNumber('Anonymous', 'CH').presentation).toBe('private');
  });

  it('matches exactly, flags ambiguity and never picks one of several leads', () => {
    const leads = [{ _id: 'a', mobile: '079 123 45 67' }, { _id: 'b', phone: '+41 44 000 00 00' }];
    expect(classifyMatch('+41791234567', leads, 'CH')).toMatchObject({ status: 'existing', leadId: 'a' });
    expect(classifyMatch('+41791234567', [...leads, { _id: 'c', normalizedPhone: '+41791234567' }], 'CH')).toMatchObject({ status: 'ambiguous', leadId: null });
    expect(classifyMatch('+41790000000', leads, 'CH').status).toBe('new');
  });
});

describe('intents, qualification, recommendations', () => {
  it('classifies questions in several languages', () => {
    expect(classifyText('How much does a CRM cost?')).toBe('PRICING_INQUIRY');
    expect(classifyText('Was kostet das?')).toBe('PRICING_INQUIRY');
    expect(classifyText('Je voudrais un rendez-vous')).toBe('APPOINTMENT_REQUEST');
    expect(classifyText('I want to build a CRM application')).toBe('SERVICE_INQUIRY');
    expect(resolveIntents({ questions: [{ text: 'price?' }, { text: 'cost of support?' }], callbackRequested: true })).toMatchObject({ primary: 'PRICING_INQUIRY', source: 'rules' });
    expect(resolveIntents({ agentIntent: { primary: 'SERVICE_INQUIRY' }, questions: [{ text: 'price?' }] })).toMatchObject({ primary: 'SERVICE_INQUIRY', secondary: ['PRICING_INQUIRY'], source: 'ai' });
  });

  const fields = (pairs, explicit = true) => Object.entries(pairs).map(([key, value]) => ({ key, value, explicit }));
  it('qualifies only on explicit information and keeps it separate from call completion', () => {
    const sales = { primary: 'SERVICE_INQUIRY', secondary: [] };
    expect(evaluateQualification({ fields: fields({ full_name: 'Sara', service_interest: 'CRM', requirements: 'leads + calls', timeline: 'Q1' }), intents: sales, callerTurns: 6 }).result).toBe('QUALIFIED');
    expect(evaluateQualification({ fields: fields({ full_name: 'Sara', service_interest: 'CRM', requirements: 'x', timeline: 'Q1' }, false), intents: sales, callerTurns: 6 }).result).toBe('UNRESOLVED');
    expect(evaluateQualification({ fields: fields({ service_interest: 'CRM' }), intents: sales, callerTurns: 3 })).toMatchObject({ result: 'PARTIALLY_QUALIFIED', missing: ['full_name', 'requirements'] });
    expect(evaluateQualification({ fields: [], intents: { primary: 'GENERAL_INFORMATION' }, callerTurns: 2 }).result).toBe('INFORMATION_ONLY');
    expect(evaluateQualification({ fields: [], intents: { primary: 'COMPLAINT' }, callerTurns: 2 }).result).toBe('SUPPORT_REQUIRED');
    expect(evaluateQualification({ fields: [], intents: {}, callerTurns: 0 }).result).toBe('UNRESOLVED');
    expect(evaluateQualification({ fields: fields({ full_name: 'x' }), intents: sales, callerTurns: 2, notInterested: true }).result).toBe('NOT_QUALIFIED');
  });

  it('recommends next actions without sending anything', () => {
    const recs = recommend({ status: 'COMPLETED', outcome: 'handled_by_ai', intents: { primary: 'PRICING_INQUIRY', secondary: ['APPOINTMENT_REQUEST'] }, qualification: { result: 'QUALIFIED' } });
    expect(recs.map((r) => r.action)).toEqual(['SEND_PRICING', 'SCHEDULE_DEMO', 'ASSIGN_SALES_REP']);
    expect(recommend({ status: 'MISSED', outcome: 'missed', presentation: 'available' }).map((r) => r.action)).toEqual(['RETURN_MISSED_CALL']);
    expect(recommend({ status: 'MISSED', outcome: 'missed', presentation: 'private' })).toEqual([]);
    expect(recommend({ status: 'COMPLETED', outcome: 'handled_by_ai', matchStatus: 'ambiguous' })[0].action).toBe('REVIEW_CALLER_MATCH');
  });
});

describe('receptionist prompt', () => {
  it('grounds answers in knowledge, never claims a transfer without one and greets once', () => {
    const agent = { name: 'Aria', title: 'Receptionist', agentConfig: { language: 'de', organizationName: 'Updata' }, inbound: { instructions: 'We build CRMs.' } };
    const prompt = buildReceptionistPrompt({ agent, caller: { known: false }, knowledgeSection: null, settings: {}, handoffAvailable: false });
    expect(prompt).toContain('Never invent prices');
    expect(prompt).toContain('Never claim you are transferring them');
    expect(prompt).toContain('start in de');
    expect(prompt).toContain('We build CRMs.');
    expect(prompt).toMatch(/Never invent or assume the caller's name/);
    expect(prompt).toMatch(/keep speaking that language for the rest of the call/);
    expect(prompt).toContain('Approved business knowledge: none published');
    expect(buildGreeting({ agent })).toMatch(/thank you for calling at Updata/);
    expect(buildGreeting({ agent: { ...agent, inbound: { greeting: 'Grüezi!' } } })).toBe('Grüezi!');
  });
});

describe('automatic work status', () => {
  it('maps outcomes and qualification to a work status; agent rules override; follow-ups and DNC win', () => {
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'INFORMATION_ONLY' }).status).toBe('resolved');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'NOT_QUALIFIED' }).status).toBe('closed');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'QUALIFIED' }).status).toBe('new');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'QUALIFIED', followUpCreated: true }).status).toBe('follow_up');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'UNRESOLVED', rules: { UNRESOLVED: 'in_progress' } }).status).toBe('in_progress');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'QUALIFIED', rules: { QUALIFIED: 'bogus' } }).status).toBe('new');
    expect(autoWorkStatus({ outcome: 'missed' }).status).toBe('new');
    expect(autoWorkStatus({ outcome: 'missed', followUpCreated: true }).status).toBe('follow_up');
    expect(autoWorkStatus({ outcome: 'handled_by_human' }).status).toBe('resolved');
    expect(autoWorkStatus({ outcome: 'handled_by_ai', qualification: 'QUALIFIED', doNotContact: true }).status).toBe('closed');
  });
});

describe('closing questions', () => {
  it('normalises keys and types, and ships templates for each agent type', () => {
    const qs = normalizeQuestions([
      { key: 'email', label: 'Email', question: 'Your email?' },
      { label: 'Party size', question: 'How many guests?', type: 'number' },
      { label: 'Party size', question: 'duplicate', type: 'number' },
      { key: 'x', label: '', question: '' },
      { key: 'custom_payment', label: 'Payment', question: 'How will you pay?', type: 'choice', options: ['card', 'cash', 'card'] },
    ]);
    expect(qs.map((x) => [x.key, x.type])).toEqual([['email', 'email'], ['custom_party_size', 'number'], ['custom_payment', 'choice']]);
    expect(qs[2].options).toEqual(['card', 'cash']);
    expect(QUESTION_TEMPLATES.map((t) => t.id)).toEqual(['contact_details', 'support', 'orders', 'restaurant', 'appointments', 'sales']);
    for (const t of QUESTION_TEMPLATES) expect(normalizeQuestions(t.questions)).toHaveLength(t.questions.length);
  });

  it('validates answers by type instead of trusting the model', () => {
    expect(validateAnswer('email', 'Sara at Example dot com'.replace(' dot ', '.').replace(' at ', '@'))).toEqual({ ok: true, value: 'sara@example.com' });
    expect(validateAnswer('email', 'sara example').ok).toBe(false);
    expect(validateAnswer('phone', '0300 1234567', { region: 'PK' })).toEqual({ ok: true, value: '+923001234567' });
    expect(validateAnswer('phone', '12', { region: 'PK' }).reason).toBe('invalid_phone');
    expect(validateAnswer('number', 'about 4')).toEqual({ ok: true, value: '4' });
    expect(validateAnswer('number', 'four people').ok).toBe(false); // never silently 0
    expect(validateAnswer('yes_no', 'Ja')).toEqual({ ok: true, value: 'yes' });
    expect(validateAnswer('choice', 'Card', { options: ['card', 'cash'] })).toEqual({ ok: true, value: 'card' });
    expect(validateAnswer('choice', 'bitcoin', { options: ['card', 'cash'] }).ok).toBe(false);
    expect(validateAnswer('address', 'Lahore').ok).toBe(false);
    expect(validateAnswer('address', 'House 12, Model Town, Lahore').ok).toBe(true);
  });

  it('tells the agent to ask before goodbye, skip what it knows and accept a refusal', () => {
    const text = closingPromptSection(normalizeQuestions(QUESTION_TEMPLATES[0].questions));
    expect(text).toMatch(/before you say goodbye/);
    expect(text).toMatch(/SKIP any whose answer the caller already gave/);
    expect(text).toMatch(/declined=true/);
    expect(text).toMatch(/key=alternate_phone/);
    expect(closingPromptSection([])).toBeNull();
  });
});
