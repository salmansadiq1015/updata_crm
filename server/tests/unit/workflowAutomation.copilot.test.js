import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Workflow Builder 2.0: copilot (scripted model → validated graph operations, live events,
 * resource + removal guards, questions), graph operations, node spec coverage, failure-branch
 * routing, new nodes (follow-up, webhook with SSRF guard) and single-step dry runs.
 */
process.env.WORKFLOW_COPILOT_PACE_MS = '0';
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

const script = [];
const create = jest.fn(async () => {
  const next = script.shift();
  if (!next) throw new Error('script exhausted');
  return { choices: [{ message: next }] };
});
const call = (name, args) => ({ id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } });
const toolTurn = (...calls) => ({ role: 'assistant', content: null, tool_calls: calls });
const lookup = jest.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => true, assertAiConfigured: () => {}, createChatModel: async () => ({}),
  createOpenAiClient: async () => ({ chat: { completions: { create } } }),
}));
jest.unstable_mockModule('node:dns/promises', () => ({ lookup, default: { lookup } }));
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(async () => ({})), addScheduledJob: jest.fn(), registerQueue: jest.fn(), getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));

let db; let copilot; let ops; let spec; let wf; let runner; let M; let Lead; let Agent; let FollowUp; let handlers; let catalog;
const actor = new mongoose.Types.ObjectId();
const n = (id, type, config = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label: '', config } });
const e = (s, h, t) => ({ id: `${s}-${h}-${t}`, source: s, sourceHandle: h, target: t });
const waitFor = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 25)); } };
const collect = async (gen) => { const out = []; for await (const ev of gen) out.push(ev); return out; };

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  copilot = (await import('../../src/modules/workflowAutomation/copilot/copilot.service.js')).default;
  ops = await import('../../src/modules/workflowAutomation/copilot/graphOps.js');
  spec = await import('../../src/modules/workflowAutomation/copilot/spec.js');
  wf = (await import('../../src/modules/workflowAutomation/workflow.service.js')).default;
  runner = (await import('../../src/modules/workflowAutomation/workflow.runner.js')).default;
  M = await import('../../src/modules/workflowAutomation/workflow.models.js');
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  Agent = (await import('../../src/modules/aiCalling/callingAgent.model.js')).default;
  FollowUp = (await import('../../src/modules/crm/leadFollowUp.model.js')).default;
  handlers = await import('../../src/modules/workflowAutomation/engine/handlers.js');
  catalog = (await import('../../src/modules/workflowAutomation/workflow.constants.js')).NODE_CATALOG;
  await import('../../src/modules/auth/user.model.js');
  runner.inline = true;
}, 120000);
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });
beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  script.length = 0; create.mockClear(); lookup.mockClear();
});

const makeLead = async (extra = {}) => (await Lead.create({ leadNumber: `L-${crypto.randomUUID()}`, name: 'Keller AG', source: 'manual', mobile: '+41791112233', address: { country: 'CH' }, createdBy: actor, status: 'new', ...extra })).toObject();
const makeAgent = (extra = {}) => Agent.collection.insertOne({ name: 'Aria Customer Support', usage: 'outbound', availability: 'active', agentType: 'customer_support', agentConfig: { language: 'en' }, questionnaire: { questions: [{ fieldKey: 'interest' }] }, createdBy: actor, ...extra });

describe('node spec', () => {
  it('describes every node type and only real config fields', async () => {
    const { normalizeConfig } = await import('../../src/modules/workflowAutomation/engine/nodeConfig.js');
    expect(Object.keys(spec.NODE_SPEC).sort()).toEqual(Object.keys(catalog).sort());
    for (const [type, s] of Object.entries(spec.NODE_SPEC)) {
      const defaults = normalizeConfig(type, {});
      for (const field of Object.keys(s.fields)) expect([type, field, Object.keys(defaults).includes(field) || ['config'].includes(field)]).toEqual([type, field, true]);
    }
  });
});

describe('graph operations', () => {
  const base = () => ({ nodes: [n('t', 'trigger.manual'), n('call', 'ai.call', { agentId: 'a1' })], edges: [e('t', 'out', 'call')] });
  const resources = { agents: new Map([['a1', { id: 'a1', name: 'Aria', usage: 'outbound' }], ['a2', { id: 'a2', name: 'Desk', usage: 'inbound' }]]), templates: new Map([['t1', { id: 't1', name: 'Info', channel: 'whatsapp' }]]), users: new Map([['u1', { id: 'u1', name: 'Anna' }]]) };

  it('adds a step after a branch, positions it below and connects it', () => {
    const { graph, change } = ops.addNode(base(), { type: 'ai.analyze', after: { node: 'call', port: 'answered' } }, resources);
    const added = graph.nodes.find((x) => x.id === change.nodeId);
    expect(added.position.y).toBeGreaterThan(0);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: 'call', sourceHandle: 'answered', target: change.nodeId }));
    expect(added.data.config).toEqual({ waitForIntelligenceMinutes: 10 });
  });

  it('rejects invented resources, wrong ports, a second trigger and edges into the trigger', () => {
    expect(() => ops.addNode(base(), { type: 'ai.call', config: { agentId: 'ghost' } }, resources)).toThrow(/does not exist/);
    expect(() => ops.addNode(base(), { type: 'ai.call', config: { agentId: 'a2' } }, resources)).toThrow(/only answers incoming/);
    expect(() => ops.addNode(base(), { type: 'msg.whatsapp', config: { templateId: 'nope' } }, resources)).toThrow(/does not exist/);
    expect(() => ops.addNode(base(), { type: 'crm.assign', config: { userId: 'u9' } }, resources)).toThrow(/does not exist/);
    expect(() => ops.addNode(base(), { type: 'end', after: { node: 'call', port: 'maybe' } }, resources)).toThrow(/no branch "maybe"/);
    expect(() => ops.addNode(base(), { type: 'trigger.lead_created' }, resources)).toThrow(/already has a trigger/);
    expect(() => ops.connectNodes(base(), { from: 'call', port: 'answered', to: 't' })).toThrow(/into the trigger/);
    expect(() => ops.updateNode(base(), { node: 'x' })).toThrow(/No step with id "x"/);
    expect(() => ops.updateNode(base(), { node: 'call', config: { $where: 1 } }, resources)).toThrow(/may not start with \$/);
  });

  it('merges config on update, replaces a branch on connect, disconnects, removes and tidies', () => {
    let g = ops.updateNode(base(), { node: 'call', config: { maxAttempts: 4 } }, resources).graph;
    expect(g.nodes[1].data.config).toMatchObject({ agentId: 'a1', maxAttempts: 4 });
    g = ops.addNode(g, { type: 'end', id: 'e1', config: { outcome: 'completed' } }, resources).graph;
    g = ops.addNode(g, { type: 'end', id: 'e2', config: { outcome: 'qualified' } }, resources).graph;
    g = ops.connectNodes(g, { from: 'call', port: 'answered', to: 'e1' }).graph;
    const r = ops.connectNodes(g, { from: 'call', port: 'answered', to: 'e2' });
    expect(r.change.replacedTarget).toBe('e1');
    g = ops.disconnect(r.graph, { from: 'call', port: 'answered' }).graph;
    expect(g.edges.filter((x) => x.source === 'call')).toHaveLength(0);
    g = ops.removeNode(g, { node: 'e1' }).graph;
    expect(g.nodes.map((x) => x.id)).not.toContain('e1');
    const laid = ops.tidyLayout(g).graph;
    expect(new Set(laid.nodes.map((x) => `${x.position.x},${x.position.y}`)).size).toBe(laid.nodes.length);
  });
});

describe('Workflow Copilot', () => {
  it('builds a workflow live with real agents, rejects invented ids, blocks unrequested deletions, validates, never saves', async () => {
    const { insertedId: agentId } = await makeAgent();
    const created = await wf.create({ name: 'New workflow' }, actor);
    script.push(
      toolTurn(call('add_node', { step: 'Configuring the lead trigger', type: 'trigger.lead_created', label: 'New lead' })),
      toolTurn(call('add_node', { step: 'Adding the AI call', type: 'ai.call', label: 'Qualification call', config: { agentId: 'invented-agent' }, after: { node: '__TRIGGER__' } })),
    );
    // The model corrects itself after the tool error; ids are filled in lazily from earlier results.
    create.mockImplementation(async (body) => {
      const toolMsgs = body.messages.filter((m) => m.role === 'tool').map((m) => JSON.parse(m.content));
      const triggerId = toolMsgs.find((t) => t.kind === 'add_node' && t.type === 'trigger.lead_created')?.nodeId;
      const callId = toolMsgs.find((t) => t.kind === 'add_node' && t.type === 'ai.call')?.nodeId;
      const nextMsg = script.shift();
      if (nextMsg) return { choices: [{ message: JSON.parse(JSON.stringify(nextMsg).replaceAll('__TRIGGER__', triggerId || '')) }] };
      const step = toolMsgs.length;
      if (step === 2) return { choices: [{ message: toolTurn(call('add_node', { step: 'Adding the AI call', type: 'ai.call', label: 'Qualification call', config: { agentId: String(agentId) }, after: { node: triggerId } })) }] };
      if (step === 3) return { choices: [{ message: toolTurn(call('add_node', { step: 'Adding the qualified end', type: 'end', config: { outcome: 'qualified' }, after: { node: callId, port: 'answered' } })) }] };
      if (step === 4) return { choices: [{ message: toolTurn(call('tidy_layout', { step: 'Arranging' }), call('validate_workflow', {})) }] };
      return { choices: [{ message: { role: 'assistant', content: 'I built the lead qualification workflow using Aria Customer Support.' } }] };
    });
    const events = await collect(copilot.run({ workflow: created, messages: [{ role: 'user', content: 'Call new leads with Aria and mark answered ones as qualified' }], graph: created.draft, userId: actor, locale: 'en' }));
    const opsEv = events.filter((x) => x.type === 'op');
    expect(opsEv.map((x) => x.step)).toEqual(['Configuring the lead trigger', 'Adding the AI call', 'Adding the qualified end', 'Arranging']);
    const errs = events.filter((x) => x.type === 'op_error').map((x) => x.code);
    expect(errs).toEqual(['unknown_agent']);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', changed: true, opsApplied: 4 });
    expect(done.graph.nodes.map((x) => x.type)).toEqual(['trigger.lead_created', 'ai.call', 'end']);
    expect(done.graph.nodes[1].data.config.agentId).toBe(String(agentId));
    expect(done.validation.errors).toEqual([]);
    expect(events.find((x) => x.type === 'message').text).toMatch(/Aria/);
    // Streaming is live: each op event carries the graph at that moment.
    expect(opsEv[0].graph.nodes).toHaveLength(1);
    expect(opsEv[1].graph.nodes).toHaveLength(2);
    // The copilot never persists: the stored draft is still empty.
    expect((await M.Workflow.findById(created._id).lean()).draft.nodes).toHaveLength(0);
    // The system prompt carried the real agent, not an invented one.
    expect(create.mock.calls[0][0].messages[0].content).toContain('Aria Customer Support');
  });

  it('asks a question with real options and ends the turn; allows removal the user asked for', async () => {
    const created = await wf.create({ name: 'x', graph: { nodes: [n('t', 'trigger.manual'), n('old', 'crm.add_note', { text: 'x' })], edges: [e('t', 'out', 'old')] } }, actor);
    create.mockImplementation(async () => ({ choices: [{ message: toolTurn(call('remove_node', { step: 'Removing the note', node: 'old', userRequestQuote: 'remove the note' })) }] }));
    script.length = 0;
    let n2 = 0;
    create.mockImplementation(async () => {
      n2 += 1;
      if (n2 === 1) return { choices: [{ message: toolTurn(call('remove_node', { step: 'Removing the note', node: 'old', userRequestQuote: 'remove the note' })) }] };
      return { choices: [{ message: { role: 'assistant', content: 'Which agent?', tool_calls: [call('ask_user', { question: 'Which AI agent should call?', kind: 'agent', options: [{ label: 'Aria', value: 'a1' }] })] } }] };
    });
    const events = await collect(copilot.run({ workflow: created, messages: [{ role: 'user', content: 'Please remove the note and add a call' }], graph: created.draft, userId: actor }));
    expect(events.filter((x) => x.type === 'op').map((x) => x.name)).toEqual(['remove_node']);
    const q = events.find((x) => x.type === 'question');
    expect(q).toMatchObject({ question: 'Which AI agent should call?', kind: 'agent', options: [{ label: 'Aria', value: 'a1' }] });
    expect(events.at(-1)).toMatchObject({ type: 'done', awaitingAnswer: true });
  });

  it('direct apply: a chosen option with a settings change is applied (validated) before the model continues', async () => {
    const { insertedId: agentId } = await makeAgent();
    const created = await wf.create({ name: 'x', graph: { nodes: [n('t', 'trigger.manual'), n('call', 'ai.call', {}), n('z', 'end', { outcome: 'completed' })], edges: [e('t', 'out', 'call'), e('call', 'answered', 'z')] } }, actor);
    const seen = [];
    create.mockImplementation(async (body) => { seen.push([...body.messages]); return { choices: [{ message: { role: 'assistant', content: 'Agent set.' } }] }; });
    const events = await collect(copilot.run({ workflow: created, messages: [{ role: 'user', content: 'Aria (id x)' }], graph: created.draft, userId: actor, apply: { node: 'call', config: { agentId: String(agentId) } } }));
    const op = events.find((x) => x.type === 'op');
    expect(op).toMatchObject({ name: 'update_node', change: { nodeId: 'call', direct: true } });
    expect(op.graph.nodes.find((x) => x.id === 'call').data.config.agentId).toBe(String(agentId));
    expect(seen[0].at(-1).content).toMatch(/ALREADY applied/);
    expect(events.at(-1)).toMatchObject({ type: 'done', changed: true, opsApplied: 1 });

    // An invented id is refused by the same resource checks; the model is told to handle it.
    seen.length = 0;
    const bad = await collect(copilot.run({ workflow: created, messages: [{ role: 'user', content: 'x' }], graph: created.draft, userId: actor, apply: { node: 'call', config: { agentId: String(new mongoose.Types.ObjectId()) } } }));
    expect(bad.find((x) => x.type === 'op_error')).toMatchObject({ name: 'update_node' });
    expect(bad.some((x) => x.type === 'op')).toBe(false);
    expect(seen[0].at(-1).content).toMatch(/failed/);
    expect(bad.at(-1)).toMatchObject({ type: 'done', changed: false, opsApplied: 0 });
  });
});

describe('Workflow Copilot — removal guard', () => {
  it('never deletes pre-existing steps without an explicit request; may clean up its own steps', async () => {
    const created = await wf.create({ name: 'g', graph: { nodes: [n('t', 'trigger.manual'), n('note', 'crm.add_note', { text: 'keep me' }), n('end', 'end', { outcome: 'completed' })], edges: [e('t', 'out', 'note'), e('note', 'out', 'end')] } }, actor);
    let i = 0;
    create.mockImplementation(async () => {
      i += 1;
      if (i === 1) return { choices: [{ message: toolTurn(call('remove_node', { step: 'Tidy', node: 'note', userRequestQuote: 'add a reminder task' })) }] };
      if (i === 2) return { choices: [{ message: toolTurn(call('add_node', { step: 'Add task', type: 'task.create', id: 'mine', config: { title: 'x' } })) }] };
      if (i === 3) return { choices: [{ message: toolTurn(call('remove_node', { step: 'Undo my own step', node: 'mine', userRequestQuote: '' })) }] };
      return { choices: [{ message: { role: 'assistant', content: 'Done.' } }] };
    });
    const events = await collect(copilot.run({ workflow: created, messages: [{ role: 'user', content: 'Please add a reminder task' }], graph: created.draft, userId: actor }));
    expect(events.filter((x) => x.type === 'op_error').map((x) => x.code)).toEqual(['removal_not_requested']);
    expect(events.filter((x) => x.type === 'op').map((x) => x.name)).toEqual(['add_node', 'remove_node']);
    expect(events.at(-1).graph.nodes.map((x) => x.id)).toEqual(['t', 'note', 'end']);
  });

  it('quote rule: user words + explicit removal verb (de/en/fr/ar), at least 10 characters', async () => {
    const { quoteMatches } = await import('../../src/modules/workflowAutomation/copilot/copilot.service.js');
    expect(quoteMatches('remove the note', ['Please remove the note now'])).toBe(true);
    expect(quoteMatches('Notiz löschen', ['Bitte die Notiz löschen'])).toBe(true);
    expect(quoteMatches('retry', ['Change the retry delay'])).toBe(false);
    expect(quoteMatches('the retry delay', ['Change the retry delay'])).toBe(false);
    expect(quoteMatches('remove the call', ['Change the retry delay'])).toBe(false);
  });
});

describe('engine 2.0', () => {
  it('routes a refused step to its connected "Failed" branch instead of failing the run', async () => {
    const { insertedId } = await makeAgent({ availability: 'archived' });
    const published = await wf.create({ name: 'f', graph: {
      nodes: [n('t', 'trigger.manual'), n('c', 'ai.call', { agentId: String(insertedId) }), n('fb', 'crm.add_tags', { add: ['call-failed'] }), n('end', 'end', { outcome: 'failed' })],
      edges: [e('t', 'out', 'c'), e('c', 'failed', 'fb'), e('fb', 'out', 'end')],
    } }, actor);
    const wfDoc = await M.Workflow.findById(published._id).lean();
    const v = await wf._publishGraph(wfDoc, wfDoc.draft, { notes: '', user: actor, meta: {} });
    const lead = await makeLead();
    await runner.enroll({ workflow: await M.Workflow.findById(v._id).lean(), leadId: lead._id, enrollmentKey: `k-${lead._id}` });
    const run = await waitFor(async () => { const r = await M.WorkflowRun.findOne({ leadId: lead._id }).lean(); return r?.status === 'completed' && r; });
    expect(run.outcome).toBe('failed');
    expect(run.steps.find((s) => s.nodeId === 'c')).toMatchObject({ port: 'failed', error: { code: 'agent_unavailable' } });
    expect((await Lead.findById(lead._id).lean()).tags).toContain('call-failed');
  });

  it('crm.follow_up creates one follow-up for the assigned rep (idempotent)', async () => {
    const lead = await makeLead({ assignedTo: actor });
    const ctx = { run: { _id: new mongoose.Types.ObjectId(), workflowId: new mongoose.Types.ObjectId(), leadId: lead._id, ownerId: actor, context: {} }, node: { id: 'fu' }, workflow: { name: 'W' }, keyHash: 'abc123', config: { dueInHours: 4, channel: 'email', assignee: 'assigned', note: 'Call {{lead.name}}' }, dry: false };
    const h = handlers.HANDLERS['crm.follow_up'];
    const a = await h.execute({ ...ctx }); const b = await h.execute({ ...ctx });
    expect(a.output.followUpId).toBe(b.output.followUpId);
    const fu = await FollowUp.findById(a.output.followUpId).lean();
    expect(fu).toMatchObject({ channel: 'email', status: 'open', note: 'Call Keller AG', source: expect.objectContaining({ type: 'workflow' }) });
    expect(String(fu.ownerId)).toBe(String(actor));
  });

  it('integration.webhook: refuses private targets and http, signs and posts to public https', async () => {
    const { isPrivateAddress } = handlers.__test__;
    expect(['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.0.10', '::1', 'fd12::1'].every(isPrivateAddress)).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    const h = handlers.HANDLERS['integration.webhook'];
    const lead = await makeLead({ email: 'k@example.ch' });
    const base = { run: { _id: new mongoose.Types.ObjectId(), workflowId: new mongoose.Types.ObjectId(), leadId: lead._id, ownerId: actor, context: {} }, node: { id: 'hook' }, workflow: { name: 'W' }, keyHash: 'k'.repeat(64), step: { attempt: 1 }, dry: false };
    expect(await h.execute({ ...base, config: { url: 'http://example.com/x', includeLead: true, timeoutSeconds: 5 } })).toMatchObject({ status: 'failed', error: { code: 'https_required' } });
    lookup.mockResolvedValueOnce([{ address: '10.1.2.3', family: 4 }]);
    expect(await h.execute({ ...base, config: { url: 'https://internal.example/x', includeLead: true, timeoutSeconds: 5 } })).toMatchObject({ status: 'failed', error: { code: 'private_address' } });
    const realFetch = globalThis.fetch;
    const fetchMock = jest.fn(async () => ({ status: 202 }));
    globalThis.fetch = fetchMock;
    process.env.WORKFLOW_WEBHOOK_SECRET = 'shh';
    try {
      const ok = await h.execute({ ...base, config: { url: 'https://hooks.example/updata', includeLead: true, timeoutSeconds: 5 } });
      expect(ok).toMatchObject({ status: 'completed', port: 'out', output: { status: 202 } });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe('https://hooks.example/updata');
      expect(init.redirect).toBe('manual');
      const body = JSON.parse(init.body);
      expect(body.lead).toMatchObject({ name: 'Keller AG', email: 'k@example.ch' });
      expect(init.headers['X-Updata-Signature']).toBe(`sha256=${crypto.createHmac('sha256', 'shh').update(init.body).digest('hex')}`);
      expect(init.headers['X-Updata-Idempotency-Key']).toHaveLength(40);
      fetchMock.mockResolvedValueOnce({ status: 503 });
      expect(await h.execute({ ...base, config: { url: 'https://hooks.example/updata', includeLead: false, timeoutSeconds: 5 } })).toMatchObject({ status: 'retry' });
      fetchMock.mockResolvedValueOnce({ status: 400 });
      expect(await h.execute({ ...base, config: { url: 'https://hooks.example/updata', includeLead: false, timeoutSeconds: 5 } })).toMatchObject({ status: 'failed', error: { code: 'webhook_http_error' } });
    } finally { globalThis.fetch = realFetch; delete process.env.WORKFLOW_WEBHOOK_SECRET; }
  });

  it('"Test this step" dry-runs a single node from the middle of the workflow', async () => {
    const created = await wf.create({ name: 's', graph: {
      nodes: [n('t', 'trigger.manual'), n('q', 'logic.condition', { rules: { op: 'and', rules: [{ field: 'lead.status', operator: 'equals', value: 'new' }] } }), n('end', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'q'), e('q', 'yes', 'end')],
    } }, actor);
    const lead = await makeLead();
    const r = await wf.test(created._id, { leadId: String(lead._id), options: { startNodeId: 'q', singleStep: true } });
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ nodeId: 'q', port: 'yes', output: { result: true } });
  });

  it('new templates and end states validate; intentional ends silence the dead-end warning', async () => {
    const { buildTemplate } = await import('../../src/modules/workflowAutomation/workflow.templates.js');
    const { validateGraph } = await import('../../src/modules/workflowAutomation/engine/graph.js');
    for (const key of ['sms-follow-up', 'whatsapp-follow-up', 'email-follow-up', 'multi-channel-qualification']) {
      const g = buildTemplate(key);
      for (const node of g.nodes) {
        if (node.type === 'ai.call') node.data.config.agentId = '6aecb5460323bfc6eb106a09';
        if (node.type === 'msg.whatsapp') node.data.config.templateId = '6aecb5460323bfc6eb106a09';
        if (/link/.test(node.data.config.body || '')) node.data.config.trackedLinkUrl = 'https://example.com';
      }
      expect([key, validateGraph(g).errors]).toEqual([key, []]);
    }
    const g = { nodes: [n('t', 'trigger.manual'), n('note', 'crm.add_note', { text: 'x' })], edges: [e('t', 'out', 'note')] };
    expect(validateGraph(g).warnings.map((w) => w.code)).toContain('node_dead_end');
    g.nodes[1].data.config.intentionalEnd = true;
    expect(validateGraph(g).warnings.map((w) => w.code)).not.toContain('node_dead_end');
  });
});
