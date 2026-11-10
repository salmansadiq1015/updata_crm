import { describe, expect, it } from '@jest/globals';
import { validateGraph, sanitizeGraph, nextNodeId } from '../../src/modules/workflowAutomation/engine/graph.js';
import { evaluateCondition, collectFields } from '../../src/modules/workflowAutomation/engine/conditions.js';
import { computeDelayUntil, nextScheduleFire, zonedParts, zonedToUtc } from '../../src/modules/workflowAutomation/engine/time.js';
import { validateNodeConfig, normalizeConfig, isConditionField } from '../../src/modules/workflowAutomation/engine/nodeConfig.js';
import { buildTemplate, TEMPLATE_KEYS } from '../../src/modules/workflowAutomation/workflow.templates.js';
import { classifyClick } from '../../src/modules/workflowAutomation/workflowLink.service.js';
import { callMatches, inboundMatches } from '../../src/modules/workflowAutomation/workflow.events.js';
import { __test__ as handlerTest } from '../../src/modules/workflowAutomation/engine/handlers.js';

const AGENT = '6aecb5460323bfc6eb106a09';
const node = (id, type, config = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, config } });
const edge = (source, sourceHandle, target) => ({ id: `${source}_${sourceHandle}_${target}`, source, sourceHandle, target });
const codes = (r) => r.errors.map((e) => `${e.nodeId || '-'}:${e.code}`);

describe('graph validation', () => {
  const valid = () => ({
    nodes: [node('t', 'trigger.manual'), node('c', 'ai.call', { agentId: AGENT }), node('q', 'logic.condition', { rules: { op: 'and', rules: [{ field: 'call.qualification', operator: 'equals', value: 'qualified' }] } }), node('e1', 'end', { outcome: 'qualified' }), node('e2', 'end', { outcome: 'completed' })],
    edges: [edge('t', 'out', 'c'), edge('c', 'answered', 'q'), edge('q', 'yes', 'e1'), edge('q', 'no', 'e2')],
  });

  it('accepts a well-formed workflow', () => {
    const r = validateGraph(valid());
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('rejects missing trigger, multiple triggers and empty graphs', () => {
    expect(codes(validateGraph({ nodes: [], edges: [] }))).toContain('-:graph_empty');
    expect(codes(validateGraph({ nodes: [node('e', 'end', { outcome: 'completed' })], edges: [] }))).toContain('-:trigger_missing');
    const g = valid(); g.nodes.push(node('t2', 'trigger.lead_created'));
    expect(codes(validateGraph(g))).toContain('t2:trigger_multiple');
  });

  it('rejects unreachable nodes, invalid ports, dangling and duplicate-port edges', () => {
    const g = valid();
    g.nodes.push(node('orphan', 'crm.add_note', { text: 'x' }));
    g.edges.push(edge('c', 'nope', 'e2'), { id: 'dang', source: 'c', sourceHandle: 'failed', target: 'ghost' }, edge('q', 'yes', 'e2'));
    const c = codes(validateGraph(g));
    expect(c).toEqual(expect.arrayContaining(['orphan:node_unreachable', 'c:edge_port_invalid', '-:edge_dangling', 'q:edge_port_duplicate']));
  });

  it('rejects edges into a trigger and self loops', () => {
    const g = valid(); g.edges.push(edge('e1', 'out', 't'), edge('c', 'failed', 'c'));
    const c = codes(validateGraph(g));
    expect(c).toEqual(expect.arrayContaining(['c:edge_self_loop']));
  });

  it('rejects loops that never wait but allows loops through a delay / call', () => {
    const unsafe = {
      nodes: [node('t', 'trigger.manual'), node('a', 'crm.add_note', { text: 'a' }), node('q', 'logic.condition', { rules: { op: 'and', rules: [{ field: 'lead.status', operator: 'equals', value: 'new' }] } }), node('e', 'end', { outcome: 'completed' })],
      edges: [edge('t', 'out', 'a'), edge('a', 'out', 'q'), edge('q', 'yes', 'a'), edge('q', 'no', 'e')],
    };
    expect(codes(validateGraph(unsafe))).toEqual(expect.arrayContaining(['a:unsafe_loop', 'q:unsafe_loop']));
    const recovery = buildTemplate('unanswered-call-recovery');
    recovery.nodes.find((n) => n.id === 'call').data.config.agentId = AGENT;
    const r = validateGraph(recovery);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('loop_present');
  });

  it('reports per-node configuration errors with field + code', () => {
    const g = valid(); g.nodes[1].data.config = { agentId: 'bad', maxAttempts: 99 };
    const r = validateGraph(g);
    expect(r.errors).toEqual(expect.arrayContaining([
      { nodeId: 'c', field: 'agentId', code: 'required' }, { nodeId: 'c', field: 'maxAttempts', code: 'out_of_range' },
    ]));
  });

  it('warns about a condition with only one branch and dead ends, errors with none', () => {
    const g = valid(); g.edges = g.edges.filter((e) => !(e.source === 'q' && e.sourceHandle === 'no'));
    g.nodes = g.nodes.filter((n) => n.id !== 'e2');
    expect(validateGraph(g).warnings.map((w) => `${w.nodeId}:${w.code}`)).toContain('q:condition_branch_missing');
    g.edges = g.edges.filter((e) => e.source !== 'q'); g.nodes = g.nodes.filter((n) => n.id !== 'e1');
    expect(codes(validateGraph(g))).toContain('q:condition_no_branch');
  });

  it('sanitizeGraph keeps only engine fields and nextNodeId follows ports', () => {
    const g = sanitizeGraph({ nodes: [{ id: 'a', type: 'end', position: { x: '5', y: 2 }, data: { label: 'x', config: { outcome: 'completed' } }, selected: true, extra: 1 }], edges: [{ id: 'e', source: 'a', target: 'b', animated: true }] });
    expect(g.nodes[0]).toEqual({ id: 'a', type: 'end', position: { x: 5, y: 2 }, data: { label: 'x', config: { outcome: 'completed' } } });
    expect(g.edges[0]).toEqual({ id: 'e', source: 'a', sourceHandle: 'out', target: 'b' });
    expect(nextNodeId(valid(), 'q', 'no')).toBe('e2');
    expect(nextNodeId(valid(), 'q', 'maybe')).toBeNull();
  });
});

describe('templates', () => {
  it.each(TEMPLATE_KEYS)('%s is structurally valid once placeholders are filled', (key) => {
    const g = buildTemplate(key);
    for (const n of g.nodes) {
      if (n.type === 'ai.call') n.data.config.agentId = AGENT;
      if (n.type.startsWith('msg.') && /\{\{\s*link/.test(n.data.config.body || '')) n.data.config.trackedLinkUrl = 'https://example.com/info';
      if (n.type === 'msg.whatsapp') n.data.config.templateId = AGENT; // any valid id: the user picks an approved template
    }
    const r = validateGraph(g);
    expect(r.errors).toEqual([]);
    expect(new Set(g.nodes.map((n) => `${n.position.x},${n.position.y}`)).size).toBe(g.nodes.length); // laid out, no overlaps
  });

  it('leaves the agent empty so publishing forces a choice', () => {
    const r = validateGraph(buildTemplate('ai-lead-qualification'));
    expect(r.errors).toContainEqual({ nodeId: 'call', field: 'agentId', code: 'required' });
  });
});

describe('condition evaluation', () => {
  const tree = { op: 'and', rules: [
    { field: 'lead.status', operator: 'in', value: 'new,contacted' },
    { op: 'or', rules: [{ field: 'call.answers.budget', operator: 'gte', value: 1000 }, { field: 'lead.tags', operator: 'contains', value: 'VIP' }] },
  ] };

  it('collects every referenced field including nested groups', () => {
    expect([...collectFields(tree)]).toEqual(['lead.status', 'call.answers.budget', 'lead.tags']);
  });

  it('evaluates AND / OR / nested groups and records a trace', () => {
    const yes = evaluateCondition(tree, { 'lead.status': 'new', 'call.answers.budget': '500', 'lead.tags': ['vip', 'x'] });
    expect(yes.result).toBe(true);
    expect(yes.trace).toHaveLength(3);
    expect(evaluateCondition(tree, { 'lead.status': 'qualified', 'call.answers.budget': 5000 }).result).toBe(false);
    expect(evaluateCondition(tree, { 'lead.status': 'contacted', 'call.answers.budget': 5000 }).result).toBe(true);
  });

  it('handles booleans, existence, numbers and dates without inventing values', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const ev = (rule, values) => evaluateCondition({ op: 'and', rules: [rule] }, values, now).result;
    expect(ev({ field: 'call.callbackRequested', operator: 'is_true' }, { 'call.callbackRequested': true })).toBe(true);
    expect(ev({ field: 'call.callbackRequested', operator: 'is_true' }, {})).toBe(false);
    expect(ev({ field: 'call.answers.role', operator: 'equals', value: 'x' }, {})).toBe(false); // unknown never equals
    expect(ev({ field: 'call.answers.role', operator: 'not_exists' }, { 'call.answers.role': '' })).toBe(true);
    expect(ev({ field: 'call.answers.dm', operator: 'equals', value: 'yes' }, { 'call.answers.dm': true })).toBe(true);
    expect(ev({ field: 'lead.score', operator: 'lt', value: 50 }, { 'lead.score': null })).toBe(false);
    expect(ev({ field: 'lead.createdAt', operator: 'within_last_hours', value: 24 }, { 'lead.createdAt': '2026-11-10T01:00:00Z' })).toBe(true);
    expect(ev({ field: 'lead.createdAt', operator: 'older_than_hours', value: 24 }, { 'lead.createdAt': '2026-11-08T01:00:00Z' })).toBe(true);
    expect(ev({ field: 'lead.createdAt', operator: 'before', value: '2026-11-09' }, { 'lead.createdAt': '2026-11-08' })).toBe(true);
  });

  it('only allows whitelisted condition fields', () => {
    expect(isConditionField('call.answers.budget')).toBe(true);
    expect(isConditionField('lead.qualification.interest')).toBe(true);
    expect(isConditionField('lead.$where')).toBe(false);
    expect(isConditionField('process.env.SECRET')).toBe(false);
    expect(isConditionField('call.answers.')).toBe(false);
  });
});

describe('timers', () => {
  const now = new Date('2026-11-10T15:30:00Z'); // Tue 16:30 Zurich

  it('duration delays and business hours in the lead timezone', () => {
    const lead = { address: { country: 'CH' } };
    expect(computeDelayUntil({ mode: 'duration', amount: 2, unit: 'hours' }, { now, lead }).at.toISOString()).toBe('2026-11-10T17:30:00.000Z');
    // 2h later = 18:30 local, outside 08–18 → next morning 08:00 Zurich (07:00Z)
    const shifted = computeDelayUntil({ mode: 'duration', amount: 2, unit: 'hours', businessHours: { enabled: true, start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] } }, { now, lead });
    expect(shifted.at.toISOString()).toBe('2026-11-11T07:00:00.000Z');
    expect(shifted.shifted).toBe(true);
    expect(shifted.timezone).toBe('Europe/Zurich');
  });

  it('time of day, next business day and fixed timezones', () => {
    expect(computeDelayUntil({ mode: 'time_of_day', time: '09:00', timezoneMode: 'fixed', timezone: 'Europe/Zurich' }, { now }).at.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    const friday = new Date('2026-11-13T10:00:00Z');
    expect(computeDelayUntil({ mode: 'next_business_day', time: '10:00', timezoneMode: 'fixed', timezone: 'Europe/Zurich', businessHours: { days: [1, 2, 3, 4, 5] } }, { now: friday }).at.toISOString()).toBe('2026-11-16T09:00:00.000Z');
    // Unknown lead country → node fallback timezone, flagged as such.
    const r = computeDelayUntil({ mode: 'time_of_day', time: '09:00', timezone: 'Asia/Karachi' }, { now, lead: { address: {} } });
    expect(r.timezoneSource).toBe('fallback');
    expect(r.at.toISOString()).toBe('2026-11-11T04:00:00.000Z');
  });

  it('never schedules in the past and handles DST in zonedToUtc', () => {
    expect(computeDelayUntil({ mode: 'until', until: '2020-01-01T00:00:00Z' }, { now }).at.getTime()).toBe(now.getTime());
    expect(zonedToUtc({ y: 2026, m: 7, d: 1, h: 9, min: 0 }, 'Europe/Zurich').toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(zonedToUtc({ y: 2026, m: 1, d: 1, h: 9, min: 0 }, 'Europe/Zurich').toISOString()).toBe('2026-01-01T08:00:00.000Z');
    expect(zonedParts(new Date('2026-11-10T23:30:00Z'), 'Europe/Zurich')).toMatchObject({ d: 11, h: 0, min: 30, dow: 3 });
  });

  it('schedule triggers fire on the configured days only', () => {
    const fire = nextScheduleFire({ time: '09:00', days: [1], timezone: 'Europe/Zurich' }, now);
    expect(fire.toISOString()).toBe('2026-11-16T08:00:00.000Z');
  });
});

describe('node configuration', () => {
  it('normalizes defaults and numeric strings', () => {
    expect(normalizeConfig('ai.call', { agentId: AGENT, maxAttempts: '3' })).toMatchObject({ agentId: AGENT, maxAttempts: 3, retryDelayMinutes: 60, timeoutHours: 72 });
  });
  it('requires a tracked URL when the message uses {{link}}', () => {
    expect(validateNodeConfig('m', 'msg.sms', { body: 'see {{ link }}', purpose: 'promotional' })).toContainEqual({ nodeId: 'm', field: 'trackedLinkUrl', code: 'tracked_link_required' });
    expect(validateNodeConfig('m', 'msg.sms', { body: 'see {{link}}', purpose: 'promotional', trackedLinkUrl: 'javascript:alert(1)' })).toContainEqual({ nodeId: 'm', field: 'trackedLinkUrl', code: 'invalid_url' });
    expect(validateNodeConfig('m', 'msg.sms', { body: 'see {{link}}', purpose: 'promotional', trackedLinkUrl: 'https://ok.example' })).toEqual([]);
  });
  it('requires an approved template for WhatsApp and bounds loop visits', () => {
    expect(validateNodeConfig('w', 'msg.whatsapp', {})).toContainEqual({ nodeId: 'w', field: 'templateId', code: 'whatsapp_template_required' });
    expect(validateNodeConfig('d', 'logic.delay', { mode: 'duration', amount: 1, unit: 'days', maxVisits: 99 })).toContainEqual({ nodeId: 'd', field: 'maxVisits', code: 'out_of_range' });
    expect(validateNodeConfig('d', 'logic.delay', { mode: 'duration', amount: 400, unit: 'days' })).toContainEqual({ nodeId: 'd', field: 'amount', code: 'out_of_range' });
  });
});

describe('link click classification', () => {
  const base = { method: 'GET', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', acceptLanguage: 'de-CH', linkCreatedAt: new Date('2026-11-10T10:00:00Z'), now: new Date('2026-11-10T10:05:00Z') };
  it('counts a real browser click as human', () => expect(classifyClick(base)).toEqual({ human: true, reason: null }));
  it.each([
    [{ method: 'HEAD' }, 'non_get'], [{ userAgent: '' }, 'no_user_agent'], [{ userAgent: 'Mozilla/5.0 (compatible; Proofpoint URL Defense)' }, 'scanner_user_agent'],
    [{ userAgent: 'WhatsApp/2.23' }, 'scanner_user_agent'], [{ acceptLanguage: '' }, 'no_accept_language'], [{ purpose: 'prefetch' }, 'prefetch'],
    [{ now: new Date('2026-11-10T10:00:02Z') }, 'too_fast'],
  ])('treats %o as automated (%s)', (patch, reason) => expect(classifyClick({ ...base, ...patch })).toEqual({ human: false, reason }));
});

describe('trigger filters and call outcome mapping', () => {
  it('maps call events to trigger outcomes', () => {
    expect(callMatches('answered', { reached: true, disposition: 'answered_completed' })).toBe(true);
    expect(callMatches('unanswered', { reached: false, disposition: 'voicemail' })).toBe(true);
    expect(callMatches('failed', { reached: false, disposition: 'failed' })).toBe(true);
    expect(callMatches('failed', { reached: false, disposition: 'no_answer' })).toBe(false);
    expect(callMatches('callback_requested', { callbackRequested: true })).toBe(true);
    expect(callMatches('qualified', { qualification: 'unqualified' })).toBe(false);
    expect(inboundMatches('missed', { outcome: 'missed' })).toBe(true);
    expect(inboundMatches('handled', { outcome: 'handled_by_ai' })).toBe(true);
  });
  it('maps recipient state + disposition to ai.call ports', () => {
    const { callOutcome } = handlerTest;
    expect(callOutcome('completed', 'answered_partial')).toBe('answered');
    expect(callOutcome('completed', 'declined')).toBe('answered');
    expect(callOutcome('exhausted', 'no_answer')).toBe('unanswered');
    expect(callOutcome('failed', 'busy')).toBe('unanswered');
    expect(callOutcome('failed', 'failed')).toBe('failed');
    expect(callOutcome('suppressed', null)).toBe('blocked');
    expect(callOutcome('retry_scheduled', 'no_answer')).toBeNull();
    expect(callOutcome('dialing', null)).toBeNull();
  });
  it('drops invalid / unknown answers from structured output', () => {
    const { answersMap } = handlerTest;
    expect(answersMap({ answers: [
      { questionFieldKey: 'budget', normalizedValue: 5000, validation: 'valid' },
      { questionFieldKey: 'role', rawAnswer: 'maybe', validation: 'unknown' },
      { questionFieldKey: 'timeline', rawAnswer: 'soon', validation: 'invalid' },
    ] })).toEqual({ budget: 5000 });
  });
});
