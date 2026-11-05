import { beforeAll, describe, expect, it } from '@jest/globals';
import { resolveCallbackTime, localTimeLine } from '../../src/modules/aiCalling/engine/callbackTime.js';
import {
  classifyOutcome, decideFollowUp, canTransition, AUTOMATION_STATES, FOLLOW_UP_OUTCOMES, pipelineStageForOutcome,
} from '../../src/modules/aiCalling/engine/followUpDecision.js';
import { knownAnswers, prefilledAnswerState, buildFollowUpContext } from '../../src/modules/aiCalling/engine/followUpContext.js';
import { AGENT_TYPES, agentTemplate, applyAgentTemplate, listAgentTemplates } from '../../src/modules/aiCalling/engine/agentTypes.js';
import { automationView } from '../../src/modules/aiCalling/engine/followUpView.js';

// Tuesday 2026-11-03 14:00 in Zurich (13:00 UTC).
const NOW = new Date('2026-11-03T13:00:00.000Z');
const ZRH = 'Europe/Zurich';
const always = { timezone: ZRH, callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
const office = { timezone: ZRH, callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5] };
const zurichClock = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: ZRH, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

describe('callback time resolution', () => {
  it('"call me again in 10 minutes" → exactly 10 minutes later (relative, not approximate)', () => {
    const r = resolveCallbackTime('Please call me again in 10 minutes', { now: NOW, timezone: ZRH, schedule: always });
    expect(r.at.toISOString()).toBe('2026-11-03T13:10:00.000Z');
    expect(r).toMatchObject({ kind: 'relative', approximate: false, shifted: false, timezone: ZRH });
    expect(r.requestedText).toBe('Please call me again in 10 minutes');
  });

  it('an ISO instant from the agent is used as is', () => {
    const r = resolveCallbackTime('2026-11-04T09:30:00+01:00', { now: NOW, timezone: ZRH });
    expect(r.at.toISOString()).toBe('2026-11-04T08:30:00.000Z');
    expect(r).toMatchObject({ kind: 'exact', approximate: false });
  });

  it('"tomorrow morning" → tomorrow 10:00 local, flagged approximate with the lead\'s words', () => {
    const r = resolveCallbackTime('Call me tomorrow morning', { now: NOW, timezone: ZRH, schedule: office });
    expect(zurichClock(r.at)).toBe('Wed 10:00');
    expect(r).toMatchObject({ kind: 'part_of_day', approximate: true });
    expect(r.evidence).toMatch(/tomorrow/i);
  });

  it('multilingual phrases: German "morgen früh", French "demain soir"', () => {
    expect(zurichClock(resolveCallbackTime('morgen früh bitte', { now: NOW, timezone: ZRH }).at)).toBe('Wed 10:00');
    expect(zurichClock(resolveCallbackTime('rappelez-moi demain soir', { now: NOW, timezone: ZRH }).at)).toBe('Wed 17:30');
  });

  it('"Friday at 15:00" → that weekday and clock time in the lead zone', () => {
    const r = resolveCallbackTime('on friday at 15:00', { now: NOW, timezone: ZRH });
    expect(zurichClock(r.at)).toBe('Fri 15:00');
    expect(r.kind).toBe('exact');
  });

  it('"call me later" / no usable time → configured default delay, approximate', () => {
    const r = resolveCallbackTime('call me later', { now: NOW, timezone: ZRH, defaultDelayMinutes: 90 });
    expect(r.at.toISOString()).toBe('2026-11-03T14:30:00.000Z');
    expect(r).toMatchObject({ kind: 'default_delay', approximate: true });
    expect(resolveCallbackTime(null, { now: NOW, defaultDelayMinutes: 120 }).at.toISOString()).toBe('2026-11-03T15:00:00.000Z');
  });

  it('a time outside the permitted calling window is moved to the next opening and the shift is reported', () => {
    // 21:00 local is outside 09–18 → next working day 09:00.
    const r = resolveCallbackTime('today at 21:00', { now: NOW, timezone: ZRH, schedule: office });
    expect(zurichClock(r.at)).toBe('Wed 09:00');
    expect(r.shifted).toBe(true);
    expect(zurichClock(r.shiftedFrom)).toBe('Tue 21:00');
  });

  it('never schedules in the past or closer than the minimum lead time', () => {
    const past = resolveCallbackTime('2026-11-01T10:00:00Z', { now: NOW, minLeadMinutes: 2 });
    expect(past.at.toISOString()).toBe('2026-11-03T13:02:00.000Z');
  });

  it('gives the agent the lead\'s local time so it can compute an ISO callback', () => {
    expect(localTimeLine(NOW, ZRH)).toMatch(/Tuesday.*14:00.*Europe\/Zurich/);
    expect(localTimeLine(NOW, 'Not/AZone')).toMatch(/UTC/);
  });
});

describe('follow-up decision engine', () => {
  const cfg = { enabled: true, autoCall: true, triggers: ['CALLBACK_REQUESTED', 'TEMPORARILY_UNAVAILABLE', 'QUALIFICATION_INCOMPLETE'], maxRounds: 3 };
  const decide = (classification, extra = {}) => decideFollowUp({ classification, config: cfg, agentId: 'a1', globalEnabled: true, lead: { status: 'contacted' }, ...extra });

  it('classifies structured outcomes, never free text alone', () => {
    expect(classifyOutcome({ disposition: 'do_not_contact' })).toBe('DO_NOT_CONTACT');
    expect(classifyOutcome({ disposition: 'answered_partial', outcome: { action: 'mark_do_not_contact' } })).toBe('DO_NOT_CONTACT');
    expect(classifyOutcome({ disposition: 'declined' })).toBe('NOT_INTERESTED');
    expect(classifyOutcome({ disposition: 'callback_requested', control: { humanRequested: true } })).toBe('HUMAN_FOLLOW_UP_REQUIRED');
    expect(classifyOutcome({ disposition: 'callback_requested' })).toBe('CALLBACK_REQUESTED');
    expect(classifyOutcome({ disposition: 'callback_requested', control: { callbackText: 'needs to discuss with partner' } })).toBe('INTERESTED_NEEDS_MORE_TIME');
    expect(classifyOutcome({ disposition: 'answered_completed', outcome: { action: 'mark_qualified', qualification: 'qualified' } })).toBe('COMPLETED');
    expect(classifyOutcome({ disposition: 'no_answer', recipientState: 'retry_scheduled' })).toBe('NO_ANSWER');
    expect(classifyOutcome({ disposition: 'busy', recipientState: 'retry_scheduled' })).toBe('BUSY');
    expect(classifyOutcome({ disposition: 'no_answer', recipientState: 'exhausted' })).toBe('TEMPORARILY_UNAVAILABLE');
    expect(classifyOutcome({ disposition: 'answered_partial', requiredGaps: ['budget'] })).toBe('QUALIFICATION_INCOMPLETE');
    expect(classifyOutcome({ disposition: 'answered_partial', behavior: { information_requested: 1 }, outcome: { qualification: 'review' } })).toBe('INFORMATION_REQUESTED');
  });

  it('schedules an AI callback with the lead\'s requested time when automation is on', () => {
    const d = decide('CALLBACK_REQUESTED', { callbackWhen: 'in 10 minutes' });
    expect(d).toMatchObject({ action: 'schedule', mode: 'ai', agentId: 'a1', outcome: 'CALLBACK_REQUESTED' });
    expect(d.delay.when).toBe('in 10 minutes');
  });

  it('automation off (organisation OR agent) still records a HUMAN callback — never drops a promise', () => {
    expect(decideFollowUp({ classification: 'CALLBACK_REQUESTED', config: cfg, globalEnabled: false })).toMatchObject({ action: 'schedule', mode: 'human', reason: 'automation_off' });
    expect(decideFollowUp({ classification: 'CALLBACK_REQUESTED', config: { ...cfg, autoCall: false }, globalEnabled: true })).toMatchObject({ action: 'schedule', mode: 'human' });
    // Non-callback outcomes create nothing while automation is off.
    expect(decideFollowUp({ classification: 'QUALIFICATION_INCOMPLETE', config: cfg, globalEnabled: false })).toMatchObject({ action: 'none' });
  });

  it('do-not-contact / not interested / converted always stop, whatever the config', () => {
    expect(decide('DO_NOT_CONTACT')).toMatchObject({ action: 'stop' });
    expect(decide('NOT_INTERESTED')).toMatchObject({ action: 'stop' });
    expect(decide('CALLBACK_REQUESTED', { lead: { status: 'converted' } })).toMatchObject({ action: 'stop', reason: 'lead_status_protected' });
    expect(decide('CALLBACK_REQUESTED', { lead: { status: 'unqualified' } })).toMatchObject({ action: 'stop', reason: 'lead_status_stop' });
  });

  it('enforces the maximum number of follow-up rounds by escalating to a person', () => {
    expect(decide('CALLBACK_REQUESTED', { round: 3 })).toMatchObject({ action: 'escalate', mode: 'human', reason: 'max_rounds_reached' });
  });

  it('leaves telephony retries to the campaign retry policy', () => {
    expect(decide('NO_ANSWER')).toMatchObject({ action: 'none', reason: 'campaign_retry_policy' });
    expect(decide('TEMPORARILY_UNAVAILABLE')).toMatchObject({ action: 'schedule', mode: 'ai', delay: { minutes: 24 * 60 } });
  });

  it('only acts on enabled triggers', () => {
    expect(decideFollowUp({ classification: 'INFORMATION_REQUESTED', config: cfg, globalEnabled: true })).toMatchObject({ action: 'none', reason: 'trigger_not_enabled' });
    // Callback variants fall back to the plain callback trigger.
    expect(decide('INTERESTED_NEEDS_MORE_TIME')).toMatchObject({ action: 'schedule', mode: 'ai', delay: { minutes: 3 * 24 * 60 } });
  });

  it('routes outcomes to specialised agents (sequential workflows) and hands off on success', () => {
    const routed = { ...cfg, routes: { CALLBACK_REQUESTED: 'david', QUALIFIED: 'emma' } };
    expect(decideFollowUp({ classification: 'CALLBACK_REQUESTED', config: routed, agentId: 'sarah', globalEnabled: true })).toMatchObject({ agentId: 'david', mode: 'ai' });
    expect(decideFollowUp({ classification: 'COMPLETED', config: routed, agentId: 'sarah', globalEnabled: true })).toMatchObject({ action: 'schedule', outcome: 'HANDOFF', agentId: 'emma' });
    expect(decideFollowUp({ classification: 'COMPLETED', config: cfg, agentId: 'sarah', globalEnabled: true })).toMatchObject({ action: 'complete' });
  });

  it('does not stack a second automatic follow-up on top of an active one (callbacks excepted)', () => {
    expect(decide('QUALIFICATION_INCOMPLETE', { hasActiveFollowUp: true })).toMatchObject({ action: 'none', reason: 'follow_up_already_active' });
    expect(decide('CALLBACK_REQUESTED', { hasActiveFollowUp: true })).toMatchObject({ action: 'schedule' });
  });

  it('validates every lifecycle transition; terminal states are final', () => {
    expect(canTransition(null, 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'queued')).toBe(true);
    expect(canTransition('queued', 'calling')).toBe(true);
    expect(canTransition('calling', 'completed')).toBe(true);
    expect(canTransition('calling', 'retry_scheduled')).toBe(true);
    expect(canTransition('paused', 'scheduled')).toBe(true);
    expect(canTransition('completed', 'scheduled')).toBe(false);
    expect(canTransition('cancelled', 'queued')).toBe(false);
    expect(canTransition('scheduled', 'calling')).toBe(false);
    expect(AUTOMATION_STATES).toEqual(expect.arrayContaining(['scheduled', 'queued', 'calling', 'completed', 'requires_human', 'retry_scheduled']));
    expect(FOLLOW_UP_OUTCOMES).toEqual(expect.arrayContaining(['CALLBACK_REQUESTED', 'DO_NOT_CONTACT', 'COMPLETED', 'QUALIFICATION_INCOMPLETE']));
  });

  it('maps outcomes only onto existing pipeline stages', () => {
    expect(pipelineStageForOutcome('CALLBACK_REQUESTED')).toBe('FOLLOW_UP');
    expect(pipelineStageForOutcome('COMPLETED')).toBeNull();
  });
});

describe('follow-up context', () => {
  const questions = [
    { fieldKey: 'dm', label: 'Decision maker', text: 'Are you the decision maker?' },
    { fieldKey: 'budget', label: 'Budget', text: 'What is your budget?', confirmCritical: true },
    { fieldKey: 'timeline', label: 'Timeline', text: 'When do you plan to start?' },
  ];
  const older = { _id: 'c1', campaignId: 'k1', endedAt: '2026-11-01T10:00:00Z', disposition: 'answered_partial',
    callNotes: { summary: 'Interested in a heat pump. Needs pricing.', blockers: ['Wants a price list first', 'Call outcome: answered partial.'] },
    answers: [{ questionFieldKey: 'dm', validation: 'valid', normalizedValue: false, rawAnswer: 'no' }] };
  const newer = { _id: 'c2', campaignId: 'k2', endedAt: '2026-11-02T10:00:00Z', disposition: 'callback_requested',
    callNotes: { summary: 'Asked to be called back.' },
    answers: [
      { questionFieldKey: 'dm', validation: 'valid', normalizedValue: true, rawAnswer: 'yes, I decide' },
      { questionFieldKey: 'budget', validation: 'valid', normalizedValue: 5000, rawAnswer: 'about 5000', confirmed: false },
    ] };

  it('treats only validated (and, when required, confirmed) answers as known; newest evidence wins', () => {
    const known = knownAnswers({ questions, previousCalls: [older, newer] });
    expect(known.dm).toMatchObject({ value: true, source: 'previous_call', callRecordId: 'c2' });
    expect(known.budget).toBeUndefined(); // confirmCritical but never confirmed → ask again
    expect(known.timeline).toBeUndefined();
  });

  it('a human correction on the lead overrides a call answer; unverified sources are ignored', () => {
    const known = knownAnswers({ questions, previousCalls: [newer], qualificationFields: [
      { fieldKey: 'dm', status: 'answered', value: false, source: 'user_correction', updatedAt: '2026-11-01T00:00:00Z' },
      { fieldKey: 'timeline', status: 'answered', value: 'Q1', source: 'not_a_real_source' },
      { fieldKey: 'budget', status: 'unknown', value: null, source: 'user' },
    ] });
    expect(known.dm).toMatchObject({ value: false, source: 'lead_record' });
    expect(known.timeline).toBeUndefined();
    expect(known.budget).toBeUndefined();
  });

  it('prefilled state marks answers resolved+confirmed and flags them as carried over', () => {
    const state = prefilledAnswerState({ dm: { value: true, raw: 'yes', source: 'previous_call', callRecordId: 'c2', at: null } });
    expect(state.dm).toMatchObject({ validation: 'valid', confirmed: true, prefilled: true, prefillSource: { type: 'previous_call', callRecordId: 'c2' } });
  });

  it('the prompt continues the conversation: reason, recap, known vs missing, no restart, bounded', () => {
    const known = knownAnswers({ questions, previousCalls: [older, newer] });
    const text = buildFollowUpContext({
      followUp: { automation: { reason: 'CALLBACK_REQUESTED', round: 2 }, source: { requestedTimeText: 'in 10 minutes' } },
      previousCalls: [older, newer], questions, known, instructions: 'Reconfirm interest.', agentNames: { k2: 'Sarah' },
    });
    expect(text).toMatch(/follow-up 2/);
    expect(text).toMatch(/asked to be called back/);
    expect(text).toMatch(/"in 10 minutes"/);
    expect(text.indexOf('2026-11-02')).toBeLessThan(text.indexOf('2026-11-01')); // newest first
    expect(text).toMatch(/by Sarah/);
    expect(text).toMatch(/do NOT ask again[\s\S]*\[dm\]/);
    expect(text).toMatch(/Still missing: \[budget\][\s\S]*\[timeline\]/);
    expect(text).toMatch(/Wants a price list first/);
    expect(text).not.toMatch(/Call outcome: answered partial/); // boilerplate blockers filtered
    expect(text).toMatch(/Never restart the interview/);
    expect(text).toMatch(/Reconfirm interest/);
    expect(text.length).toBeLessThan(3000);
  });
});

describe('agent type templates', () => {
  it('provides all business roles as configurable templates', () => {
    expect(AGENT_TYPES).toEqual(['sales', 'follow_up', 'customer_support', 'receptionist', 'lead_qualification', 'appointment',
      'retention', 'collection', 'feedback', 'renewal', 'onboarding', 'custom']);
    expect(listAgentTemplates()).toHaveLength(12);
    expect(agentTemplate('nope').type).toBe('custom');
    for (const t of listAgentTemplates().filter((x) => x.type !== 'custom')) {
      expect(t.objective.length).toBeGreaterThan(20);
      expect(t.instructions.length).toBeGreaterThan(20);
      expect(t.triggers).toContain('CALLBACK_REQUESTED');
    }
  });

  it('fills only empty fields — what the admin wrote is never replaced', () => {
    const filled = applyAgentTemplate({ agentType: 'sales', agentConfig: { objective: 'My own objective' }, followUp: { enabled: true } });
    expect(filled.agentConfig.objective).toBe('My own objective');
    expect(filled.agentConfig.instructions).toMatch(/approved knowledge/);
    expect(filled.followUp.instructions).toMatch(/Reconfirm interest/);
    expect(filled.followUp.triggers).toEqual(expect.arrayContaining(['CALLBACK_REQUESTED', 'INFORMATION_REQUESTED']));
    expect(applyAgentTemplate({ agentType: 'sales', followUp: { triggers: ['QUALIFICATION_INCOMPLETE'] } }).followUp.triggers).toEqual(['QUALIFICATION_INCOMPLETE']);
  });
});

describe('automation view', () => {
  it('is null for plain human tasks and exposes state + live call for AI follow-ups', () => {
    expect(automationView({ mode: 'human' })).toBeNull();
    const v = automationView({ mode: 'ai', state: 'calling', agentId: 'a', reason: 'CALLBACK_REQUESTED', round: 2, history: [{ state: 'queued', at: NOW }] },
      { state: 'in_progress', disposition: null, callNotes: { summary: 'x' } });
    expect(v).toMatchObject({ mode: 'ai', state: 'calling', round: 2, call: { state: 'in_progress', summary: 'x' } });
  });
});

describe('follow-up routing rules (lead and call facts)', () => {
  let routing;
  beforeAll(async () => { routing = await import('../../src/modules/aiCalling/engine/followUpRouting.js'); });
  const lead = { source: 'extension', status: 'contacted', type: 'business', address: { country: 'MA', city: 'Fès' }, sourceMetadata: { businessType: 'Heating installer' } };
  const call = { conversationLanguage: { current: 'ar-MA' } };
  const rules = [
    { name: 'disabled', enabled: false, agentId: 'x', when: {} },
    { name: 'German speakers', agentId: 'de-agent', when: { languages: ['de'] } },
    { name: 'Moroccan heating leads', agentId: 'ma-agent', when: { countries: ['ma'], cities: ['fes'], businessTypes: ['heating'], languages: ['ar'], leadSources: ['extension'] } },
    { name: 'catch-all callbacks', agentId: 'generic', when: { outcomes: ['CALLBACK_REQUESTED'] } },
  ];

  it('first enabled rule whose every condition matches wins (case/accent-insensitive, language prefix, type substring)', () => {
    const ctx = routing.routingContext({ outcome: 'CALLBACK_REQUESTED', lead, call });
    expect(ctx).toMatchObject({ languages: 'ar-MA', countries: 'MA', cities: 'Fès', leadSources: 'extension', businessTypes: 'Heating installer' });
    expect(routing.matchRoutingRule(rules, ctx).name).toBe('Moroccan heating leads');
    expect(routing.matchRoutingRule(rules, { ...ctx, cities: 'Rabat' }).name).toBe('catch-all callbacks');
    expect(routing.matchRoutingRule(rules, { ...ctx, outcomes: 'TEMPORARILY_UNAVAILABLE', cities: 'Rabat' })).toBeNull();
  });

  it('a hand-over after success needs an explicit QUALIFIED rule', () => {
    const ctx = routing.routingContext({ outcome: 'QUALIFIED', lead, call });
    expect(routing.matchRoutingRule(rules, ctx)).toBeNull();
    expect(routing.matchRoutingRule([{ name: 'to sales', agentId: 'sales', when: { outcomes: ['QUALIFIED'], countries: ['MA'] } }], ctx).agentId).toBe('sales');
  });

  it('rules override per-outcome routes, which override the calling agent', () => {
    const config = { routes: { CALLBACK_REQUESTED: 'routed' }, routingRules: [{ name: 'MA', agentId: 'ma-agent', when: { countries: ['MA'] } }] };
    expect(routing.effectiveRoutes({ config, classification: 'CALLBACK_REQUESTED', lead, call })).toMatchObject({ routes: { CALLBACK_REQUESTED: 'ma-agent' }, rule: { name: 'MA' } });
    expect(routing.effectiveRoutes({ config, classification: 'CALLBACK_REQUESTED', lead: { ...lead, address: { country: 'CH' } }, call }).routes.CALLBACK_REQUESTED).toBe('routed');
    const decision = decideFollowUp({ classification: 'CALLBACK_REQUESTED', config: { enabled: true, autoCall: true, routes: routing.effectiveRoutes({ config, classification: 'CALLBACK_REQUESTED', lead, call }).routes }, agentId: 'self', globalEnabled: true });
    expect(decision.agentId).toBe('ma-agent');
  });
});
