import { describe, expect, it } from 'vitest';
import {
  activeFilterCount, agentAssignments, aiTone, deviceSimLabel, reportedSimOptions, simName, allowedControls, buildConversationTimeline, callIdFromSearch, callerDisplay, compactDeviceAgents, dayEndIso, dayStartIso,
  deviceAgentFor, enumLabel, eventLabel, filtersToQuery, formatDuration, formatRate, isAiConnected, isConflict, parseList, rangeFor, ruleToDraft,
  rulePayload, rowsToCsv, settingsPatch, simLabel, sortRules, statusTone, upsertDeviceAgent, type T,
} from '../inbound-domain';
import type { InboundCallRow, InboundRule, InboundSettings } from '../types/inbound-call-types';

const t: T = (key, fallback, vars) => (fallback ?? key).replace(/\{(\w+)\}/g, (m, k) => (vars?.[k] != null ? String(vars[k]) : m));

const row = (over: Partial<InboundCallRow> = {}): InboundCallRow => ({
  id: 'a'.repeat(24), callId: 'in_x', caller: { name: null, number: '+41791234567', presentation: 'available' }, callerType: 'new', lead: null,
  status: 'COMPLETED', aiStatus: 'ended', audioStatus: 'closed', handling: 'ai', answeredBy: 'ai', outcome: 'handled_by_ai', agent: { id: 'g1', name: 'Mia' },
  rule: null, aiBlockedBy: null, sim: { slot: 1, label: null }, device: { id: 'd1', name: 'Office phone' }, durationSeconds: 125, ringSeconds: 4,
  primaryInquiry: 'PRICING_INQUIRY', qualification: 'QUALIFIED', callbackRequested: false, humanRequested: false,
  detectedAt: '2026-11-03T09:00:00.000Z', answeredAt: '2026-11-03T09:00:04.000Z', endedAt: '2026-11-03T09:02:09.000Z', ...over,
});

describe('filtersToQuery', () => {
  it('keeps only set filters, trims search and maps SIM 1/2 to slots 0/1', () => {
    const q = filtersToQuery({ search: '  meier ', handledBy: 'ai', callerType: '', simSlot: '1', outcome: 'missed', agentId: '', inquiry: 'COMPLAINT' }, { page: 2, limit: 50, sort: 'longest' });
    expect(q).toEqual({ search: 'meier', handledBy: 'ai', simSlot: 1, outcome: 'missed', inquiry: 'COMPLAINT', page: 2, limit: 50, sort: 'longest' });
  });
  it('turns local days into ISO bounds covering the whole day', () => {
    const q = filtersToQuery({ from: '2026-11-01', to: '2026-11-02' });
    expect(new Date(String(q.from)).getTime()).toBe(new Date('2026-11-01T00:00:00').getTime());
    expect(new Date(String(q.to)).getTime()).toBe(new Date('2026-11-02T23:59:59.999').getTime());
  });
  it('ignores malformed dates and an unset SIM', () => {
    expect(filtersToQuery({ from: '11/01/2026', simSlot: '' })).toEqual({});
    expect(dayStartIso('nope')).toBeUndefined();
    expect(dayEndIso('2026-13-45')).toBeUndefined();
  });
  it('passes the time zone for analytics bucketing', () => {
    expect(filtersToQuery({}, { tz: 'Europe/Zurich' })).toEqual({ tz: 'Europe/Zurich' });
  });
  it('counts active filters', () => {
    expect(activeFilterCount({ search: ' ', handledBy: 'human', simSlot: '0' })).toBe(2);
  });
});

describe('formatters', () => {
  it('formats durations as m:ss or h:mm:ss and dashes unknowns', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('—');
  });
  it('formats rates and leaves missing ones as a dash', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(42.5)).toMatch(/^42[.,]5%$/);
  });
  it('labels SIM slots from 1 and prefers a stored label', () => {
    expect(simLabel(0)).toBe('SIM 1');
    expect(simLabel(1, ' Business ')).toBe('Business');
    expect(simLabel(null)).toBe('—');
  });
  it('shows a withheld number honestly', () => {
    expect(callerDisplay(row({ caller: { name: null, number: null, presentation: 'private' } }), t)).toBe('Withheld number');
    expect(callerDisplay(row({ caller: { name: null, number: '+4179', presentation: 'available' }, lead: { id: 'l', name: 'Bäckerei', number: 'L-1', created: false } }), t)).toBe('Bäckerei');
  });
  it('builds date presets', () => {
    expect(rangeFor('all')).toEqual({ from: '', to: '' });
    expect(rangeFor('7d', new Date(2026, 10, 4, 12))).toEqual({ from: '2026-10-29', to: '2026-11-04' });
  });
});

describe('labels and tones', () => {
  it('translates enum values with a readable fallback for unknown ones', () => {
    expect(enumLabel(t, 'status', 'AI_ACTIVE')).toBe('Ai active');
    expect(enumLabel(t, 'outcome', null)).toBe('—');
  });
  it('treats only connected/speaking/listening as AI connected — never infers from call status', () => {
    expect(isAiConnected('connected')).toBe(true);
    expect(isAiConnected('speaking')).toBe(true);
    expect(isAiConnected('connecting')).toBe(false);
    expect(isAiConnected('waiting')).toBe(false);
    expect(aiTone('failed')).toBe('danger');
  });
  it('maps call statuses to tones', () => {
    expect(statusTone('RINGING')).toBe('info');
    expect(statusTone('AI_ACTIVE')).toBe('live');
    expect(statusTone('COMPLETED')).toBe('success');
    expect(statusTone('MISSED')).toBe('warning');
    expect(statusTone('FAILED')).toBe('danger');
  });
  it('labels status transition events', () => {
    expect(eventLabel({ type: 'status:MISSED', at: '' }, t)).toBe('Status: Missed');
    expect(eventLabel({ type: 'callback_requested', at: '' }, t)).toBe('Callback requested');
  });
});

describe('allowedControls (mirrors the server)', () => {
  it('ringing call not routed to the AI: answer + reject', () => {
    expect(allowedControls({ status: 'RINGING', handling: 'human' })).toEqual(['answer', 'reject']);
  });
  it('ringing call already routed to the AI: reject only', () => {
    expect(allowedControls({ status: 'RINGING', handling: 'ai' })).toEqual(['reject']);
    expect(allowedControls({ status: 'ANSWERING', handling: 'human' })).toEqual(['reject']);
  });
  it('AI on the call: take over + hang up; person on the call: hang up', () => {
    expect(allowedControls({ status: 'AI_ACTIVE', handling: 'ai' })).toEqual(['takeover', 'hangup']);
    expect(allowedControls({ status: 'HUMAN_ACTIVE', handling: 'human' })).toEqual(['hangup']);
  });
  it('nothing once the call is ending or ended', () => {
    expect(allowedControls({ status: 'WRAPPING_UP', handling: 'ai' })).toEqual([]);
    expect(allowedControls({ status: 'COMPLETED', handling: 'ai' })).toEqual([]);
  });
});

describe('buildConversationTimeline', () => {
  it('interleaves turns, events and language switches by time and drops the duplicate switch event', () => {
    const items = buildConversationTimeline(
      [{ itemId: '1', role: 'assistant', text: 'Hello', at: '2026-11-03T09:00:05Z' }, { itemId: '2', role: 'caller', text: 'Bonjour', at: '2026-11-03T09:00:09Z' }],
      [{ type: 'status:AI_ACTIVE', at: '2026-11-03T09:00:04Z' }, { type: 'language_switch', at: '2026-11-03T09:00:10Z' }],
      [{ from: 'en', to: 'fr', at: '2026-11-03T09:00:10Z' }],
    );
    expect(items.map((i) => i.kind)).toEqual(['event', 'turn', 'turn', 'language']);
  });
  it('keeps items without a timestamp at the end in their original order', () => {
    const items = buildConversationTimeline([{ itemId: '1', role: 'caller', text: 'a', at: null }], [{ type: 'silence', at: '2026-11-03T09:00:00Z' }]);
    expect(items.map((i) => i.kind)).toEqual(['event', 'turn']);
  });
});

describe('rules', () => {
  const rule: InboundRule = {
    id: 'r1', name: 'VIP', enabled: true, priority: 10, action: 'human', agentId: 'agent1',
    conditions: { callerType: 'existing_lead', numbers: ['+41791112233'], numberPrefixes: ['+41'], deviceIds: ['d1'], simSlots: [1], withinBusinessHours: false, leadStatuses: ['qualified'] },
  };
  it('round-trips a rule through the draft and builds only schema keys', () => {
    const payload = rulePayload(ruleToDraft(rule));
    expect(payload).toEqual({
      id: 'r1', name: 'VIP', enabled: true, priority: 10, action: 'human', agentId: null,
      conditions: { callerType: 'existing_lead', numbers: ['+41791112233'], numberPrefixes: ['+41'], deviceIds: ['d1'], simSlots: [1], withinBusinessHours: false, leadStatuses: ['qualified'] },
    });
  });
  it('keeps the agent only for AI answering and clamps priority', () => {
    const d = { ...ruleToDraft(null), name: ' Night ', action: 'ai_answer' as const, agentId: 'a9', priority: 5000, numbers: '+41 79 1, +41 79 1\n+33 6' };
    const p = rulePayload(d);
    expect(p.name).toBe('Night');
    expect(p.agentId).toBe('a9');
    expect(p.priority).toBe(1000);
    expect(p.conditions.numbers).toEqual(['+41 79 1', '+33 6']);
    expect(p.conditions.withinBusinessHours).toBeNull();
    expect('id' in p).toBe(false);
  });
  it('sorts by priority, then creation order', () => {
    const a = { ...rule, id: 'a', priority: 50 }; const b = { ...rule, id: 'b', priority: 10 }; const c = { ...rule, id: 'c', priority: 50 };
    expect(sortRules([a, b, c]).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('parses free-text lists', () => {
    expect(parseList(' +41, +33 ;\n\n+41 ')).toEqual(['+41', '+33']);
  });
});

describe('settings', () => {
  const base: InboundSettings = {
    enabled: false, organizationName: '', defaultRegion: 'CH', defaultAgentId: null, deviceAgents: [], answerDelaySeconds: 4, ringTimeoutSeconds: 45,
    maxConcurrentAiSessions: 1, fallbackAction: 'human', businessHours: { enabled: false, timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    outsideHoursAction: 'ai_answer', blockedNumbers: [], blockedAction: 'human', rules: [], leadCreation: 'ai_answered',
    qualification: { required: ['full_name'], anyOf: [], promoteLeadStatus: true },
    automation: { createFollowUps: true, followUpFor: ['QUALIFIED'], returnMissedCalls: true, notifyMissed: true, notifyHandoff: true, notifyQualified: true, autoSendSms: false, autoSendEmail: false },
    handoffWaitSeconds: 30, aiDisclosure: true, transcriptRetentionDays: 365, version: 7,
  };
  it('returns null when nothing changed', () => {
    expect(settingsPatch(base, { ...base })).toBeNull();
  });
  it('sends only changed editable keys plus the base version (never rules)', () => {
    const draft = { ...base, enabled: true, rules: [{ id: 'x' } as unknown as InboundRule], businessHours: { ...base.businessHours, start: '08:00' } };
    expect(settingsPatch(base, draft)).toEqual({ enabled: true, businessHours: { enabled: false, timezone: 'UTC', days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }, version: 7 });
  });
  it('strips server-only nested keys (e.g. _id) from objects it sends', () => {
    const withId = { ...base, automation: { ...base.automation, _id: 'zz' } as InboundSettings['automation'] };
    const draft = { ...withId, automation: { ...withId.automation, autoSendSms: true } };
    expect(settingsPatch(withId, draft)?.automation).not.toHaveProperty('_id');
  });
  it('keeps device/SIM agent rows only when they differ from the default', () => {
    let rows = upsertDeviceAgent([], { deviceId: 'd1', simSlot: null, agentId: 'a1', aiEnabled: true });
    rows = upsertDeviceAgent(rows, { deviceId: 'd1', simSlot: 1, agentId: null, aiEnabled: false });
    rows = upsertDeviceAgent(rows, { deviceId: 'd1', simSlot: 0, agentId: null, aiEnabled: true });
    expect(rows).toEqual([{ deviceId: 'd1', simSlot: null, agentId: 'a1', aiEnabled: true }, { deviceId: 'd1', simSlot: 1, agentId: null, aiEnabled: false }]);
    expect(deviceAgentFor(rows, 'd1', 0)).toEqual({ deviceId: 'd1', simSlot: 0, agentId: null, aiEnabled: true });
    expect(compactDeviceAgents([...rows, { deviceId: 'd1', simSlot: null, agentId: 'a2', aiEnabled: true }])).toHaveLength(2);
  });
  it('recognises a version conflict', () => {
    expect(isConflict({ statusCode: 409, message: 'changed' })).toBe(true);
    expect(isConflict({ statusCode: 400 })).toBe(false);
  });
});

describe('csv + links', () => {
  it('exports selected rows with a BOM and escapes cells', () => {
    const csv = rowsToCsv([row({ caller: { name: 'Meier, Hans "HM"', number: '+4179', presentation: 'available' } })], t);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = csv.slice(1).split('\n');
    expect(header.startsWith('date,caller_name,caller_number')).toBe(true);
    expect(line).toContain('"Meier, Hans ""HM"""');
    expect(line).toContain('SIM 2');
  });
  it('reads a valid ?call= id only', () => {
    expect(callIdFromSearch('?call=0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
    expect(callIdFromSearch('?call=../etc')).toBeNull();
  });
});

describe('SIM names come from what each phone reported', () => {
  const devices = [
    { id: 'd1', name: 'Office phone', sims: [{ slot: 0, label: '', carrier: 'Swisscom' }, { slot: 1, label: 'Business', carrier: 'Salt' }] },
    { id: 'd2', name: 'Shop phone', sims: [{ slot: 0, label: '', carrier: 'Salt' }] },
    { id: 'd3', name: 'Old phone', sims: [] },
  ];
  it('labels a SIM as label, else carrier, else "SIM n"', () => {
    expect(simName({ slot: 1, label: 'Business', carrier: 'Salt' })).toBe('Business');
    expect(simName({ slot: 0, label: ' ', carrier: 'Swisscom' })).toBe('Swisscom');
    expect(simName({ slot: 2, label: '', carrier: '' })).toBe('SIM 3');
  });
  it('resolves a call\'s SIM on its phone, falling back to the stored label and then "SIM n"', () => {
    expect(deviceSimLabel(devices, 'd1', 1)).toBe('Business');
    expect(deviceSimLabel(devices, 'd3', 0, 'Work')).toBe('Work');
    expect(deviceSimLabel(devices, 'd3', 1)).toBe('SIM 2');
    expect(deviceSimLabel(devices, 'd1', null)).toBe('—');
  });
  it('builds filter options only from reported SIMs, joining different names for a slot', () => {
    expect(reportedSimOptions(devices)).toEqual([{ slot: 0, label: 'Swisscom / Salt' }, { slot: 1, label: 'Business' }]);
    expect(reportedSimOptions([{ sims: [] }])).toEqual([]);
    expect(reportedSimOptions(undefined)).toEqual([]);
  });
  it('lists the phones/SIMs explicitly assigned to an agent (AI on only)', () => {
    const rows = [
      { deviceId: 'd1', simSlot: null, agentId: 'a1', aiEnabled: true },
      { deviceId: 'd2', simSlot: 0, agentId: 'a1', aiEnabled: true },
      { deviceId: 'd1', simSlot: 1, agentId: 'a1', aiEnabled: false },
      { deviceId: 'd3', simSlot: null, agentId: 'a2', aiEnabled: true },
    ];
    expect(agentAssignments('a1', rows, devices)).toEqual(['Office phone', 'Shop phone · Salt']);
  });
  it('maps any reported SIM slot and the new-leads filter to the API', () => {
    expect(filtersToQuery({ simSlot: '2', leadCreated: true })).toEqual({ simSlot: 2, leadCreated: 'true' });
    expect(filtersToQuery({ simSlot: '9' })).toEqual({});
  });
});
