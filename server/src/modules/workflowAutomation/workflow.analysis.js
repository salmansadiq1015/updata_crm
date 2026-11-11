/**
 * Workflow "Full check" — one read-only report that tells the user whether a workflow will work:
 *
 *   1. settings & references   validateGraph + resource checks (agents, templates, users)
 *   2. every step really runs   each step's handler is executed in dry mode on a sample lead
 *   3. every path ends          all branch combinations from the trigger (bounded) are walked
 *   4. channels are live        calling (launch preflight) and SMS / WhatsApp / email providers
 *
 * Nothing is called, sent, stored or changed. Each problem is attached to the step it concerns
 * so the UI can show it there and offer a fix (manually or through the copilot).
 */
import mongoose from 'mongoose';
import { LIMITS, NODE_CATALOG } from './workflow.constants.js';
import { HANDLERS } from './engine/handlers.js';
import { normalizeConfig } from './engine/nodeConfig.js';
import { findTrigger } from './engine/graph.js';
import logger from '../../shared/logger/index.js';

const MAX_PATHS = 200;
const SHOW_PATHS = 40;
const CHANNEL_OF = { 'ai.call': 'voice', 'ai.callback': 'voice', 'msg.sms': 'sms', 'msg.whatsapp': 'whatsapp', 'msg.email': 'email' };
const DRY_OPTIONS = { callOutcome: 'answered', analysis: 'qualified', messageOutcome: 'sent', eventOutcome: 'matched' };

/** A neutral lead for the step dry-run when the user did not pick one. Never stored. */
export const sampleLead = () => ({
  _id: new mongoose.Types.ObjectId(), name: 'Sample Lead', firstName: 'Sample', lastName: 'Lead', businessName: 'Sample AG',
  mobile: '+41790000000', email: 'sample.lead@example.com', status: 'new', source: 'manual', tags: [], address: { country: 'CH', city: 'Zürich' },
  customFields: {}, isDeleted: false, createdAt: new Date(),
});

const withTimeout = (promise, ms, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms))]);

/**
 * All routes from the trigger to wherever they stop. A branch without a connection is "open"
 * (or "stops" when the step is marked as an intentional end); a revisited step is a bounded
 * "repeat" (retry loops). The walk is capped so huge graphs stay cheap.
 */
export function enumeratePaths(graph) {
  const trigger = findTrigger(graph);
  if (!trigger) return { total: 0, truncated: false, paths: [], byStatus: {} };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const next = new Map(graph.edges.map((e) => [`${e.source}:${e.sourceHandle || 'out'}`, e.target]));
  const paths = []; const byStatus = {}; let total = 0; let truncated = false;
  const record = (p) => {
    total += 1; byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    if (paths.length < SHOW_PATHS) paths.push(p);
  };
  const walk = (nodeId, steps, visits) => {
    if (total >= MAX_PATHS) { truncated = true; return; }
    const node = byId.get(nodeId);
    if (!node) { record({ steps, status: 'open', end: null }); return; }
    const seen = visits.get(nodeId) || 0;
    if (seen >= 1) { record({ steps: [...steps, { nodeId }], status: 'repeats', end: null }); return; }
    const nextVisits = new Map(visits).set(nodeId, seen + 1);
    if (node.type === 'end') { record({ steps: [...steps, { nodeId }], status: 'ends', end: node.data?.config?.outcome || 'completed' }); return; }
    const ports = NODE_CATALOG[node.type]?.outputs || [];
    if (!ports.length) { record({ steps: [...steps, { nodeId }], status: 'open', end: null }); return; }
    for (const port of ports) {
      const here = [...steps, { nodeId, port }];
      const target = next.get(`${nodeId}:${port}`);
      if (!target) record({ steps: here, status: node.data?.config?.intentionalEnd ? 'stops' : 'open', end: null });
      else walk(target, here, nextVisits);
      if (total >= MAX_PATHS) { truncated = true; return; }
    }
  };
  walk(trigger.id, [], new Map());
  return { total, truncated, paths, byStatus };
}

async function channelReadiness(graph) {
  const used = {};
  for (const n of graph.nodes) {
    const ch = CHANNEL_OF[n.type];
    if (ch) (used[ch] ||= []).push(n.id);
  }
  const out = {};
  const messagingChannels = ['sms', 'whatsapp', 'email'].filter((c) => used[c]);
  if (messagingChannels.length) {
    try {
      const { default: messaging } = await import('../messaging/messaging.service.js');
      const ready = await withTimeout(messaging.channelReadiness(), 8000, 'messaging');
      for (const c of messagingChannels) out[c] = { nodes: used[c], ready: Boolean(ready[c]?.ready), reason: ready[c]?.reason || null, providers: ready[c]?.providers || [] };
    } catch (error) {
      for (const c of messagingChannels) out[c] = { nodes: used[c], ready: false, reason: 'check_failed', providers: [] };
      logger.warn('Workflow check: messaging readiness unavailable', { module: 'workflow', error: error.message });
    }
  }
  if (used.voice) {
    // Same preflight a real launch runs, per agent (cloud line or the agent's paired phone).
    const nodes = graph.nodes.filter((n) => CHANNEL_OF[n.type] === 'voice');
    const agentIds = [...new Set(nodes.map((n) => String(n.data?.config?.agentId || '')).filter((id) => mongoose.isValidObjectId(id)))];
    const perAgent = {};
    if (agentIds.length) {
      const [{ default: CallingAgent }, { default: calling }] = await Promise.all([import('../aiCalling/callingAgent.model.js'), import('../aiCalling/aiCalling.service.js')]);
      const agents = await CallingAgent.find({ _id: { $in: agentIds } }).select('createdBy transport pairedDeviceId').lean();
      for (const a of agents) {
        try {
          await withTimeout(calling.assertLaunchAvailable({ transport: a.transport || 'cloud_sip', pairedDeviceId: a.pairedDeviceId || null }, a.createdBy), 8000, 'calling');
          perAgent[String(a._id)] = { ready: true, reason: null };
        } catch (error) { perAgent[String(a._id)] = { ready: false, reason: error.message || 'unavailable' }; }
      }
    }
    const failing = Object.values(perAgent).find((r) => !r.ready);
    out.voice = { nodes: used.voice, ready: agentIds.length > 0 && !failing, reason: failing?.reason || (agentIds.length ? null : 'no_agent'), agents: perAgent };
  }
  return out;
}

async function dryRunSteps({ workflow, graph, lead }) {
  const run = { _id: new mongoose.Types.ObjectId(), workflowId: workflow._id, leadId: lead._id, ownerId: null, context: {}, visits: {}, stepCount: 0, createdAt: new Date() };
  const results = {};
  for (const node of graph.nodes) {
    const handler = HANDLERS[node.type];
    if (!handler) { results[node.id] = { status: 'failed', error: { code: 'unknown_step', message: `Unknown step type ${node.type}` } }; continue; }
    try {
      const result = await withTimeout(handler.execute({
        run, node, step: { startedAt: new Date() }, workflow, actionKey: `check:${node.id}`, keyHash: `check-${node.id}`,
        config: normalizeConfig(node.type, node.data?.config), dry: true, dryOptions: DRY_OPTIONS, _lead: lead,
      }), 8000, 'step');
      results[node.id] = result.status === 'failed'
        ? { status: 'failed', error: result.error || { code: 'failed', message: 'The step failed' } }
        : { status: 'ok', port: result.port || null, output: result.output || null };
    } catch (error) {
      results[node.id] = { status: 'failed', error: { code: 'step_error', message: error.message } };
    }
  }
  return results;
}

/**
 * @param {{ workflow: object, graph: object, validation: { errors: object[], warnings: object[] }, lead?: object|null }} input
 */
export async function analyzeWorkflow({ workflow, graph, validation, lead = null }) {
  const subject = lead || sampleLead();
  const [dry, channels] = await Promise.all([dryRunSteps({ workflow, graph, lead: subject }), channelReadiness(graph)]);
  const paths = enumeratePaths(graph);

  const issuesByNode = new Map(graph.nodes.map((n) => [n.id, []]));
  const general = [];
  const push = (issue) => (issue.nodeId && issuesByNode.has(issue.nodeId) ? issuesByNode.get(issue.nodeId).push(issue) : general.push(issue));
  for (const e of validation.errors) push({ ...e, severity: 'error' });
  for (const w of validation.warnings) push({ ...w, severity: w.severity === 'info' ? 'info' : 'warning' });
  // Dry-run failures only add information when validation did not already explain the step.
  for (const [nodeId, r] of Object.entries(dry)) {
    if (r.status === 'failed' && !issuesByNode.get(nodeId)?.some((i) => i.severity === 'error')) push({ nodeId, code: 'dry_run_failed', severity: 'error', message: r.error?.message || null });
  }
  for (const [channel, c] of Object.entries(channels)) {
    if (c.ready) continue;
    for (const nodeId of c.nodes) {
      if (channel === 'voice' && c.reason === 'no_agent') continue; // already reported as "choose an agent"
      push({ nodeId, code: 'channel_unavailable', severity: 'error', channel, reason: c.reason });
    }
  }

  const nodes = graph.nodes.map((n) => {
    const issues = issuesByNode.get(n.id);
    // Unconnected branches are only "info" for publishing, but in the check they are something missing.
    const status = issues.some((i) => i.severity === 'error') ? 'error' : issues.length ? 'warning' : 'ok';
    return { nodeId: n.id, type: n.type, label: n.data?.label || '', status, issues, dryRun: dry[n.id] || null };
  });
  const errors = nodes.reduce((s, n) => s + n.issues.filter((i) => i.severity === 'error').length, 0) + general.filter((i) => i.severity === 'error').length;
  const warnings = nodes.reduce((s, n) => s + n.issues.filter((i) => i.severity === 'warning').length, 0) + general.filter((i) => i.severity === 'warning').length;
  const openPaths = paths.byStatus.open || 0;
  const status = errors ? 'blocked' : warnings || openPaths ? 'attention' : 'ready';

  return {
    checkedAt: new Date(), status,
    counts: { steps: nodes.length, stepsOk: nodes.filter((n) => n.status === 'ok').length, errors, warnings, paths: paths.total, openPaths, endingPaths: paths.byStatus.ends || 0 },
    lead: lead ? { _id: lead._id, name: lead.name } : null,
    general, nodes, channels, paths,
    limits: { maxPaths: MAX_PATHS, maxVisits: LIMITS.defaultMaxVisits },
  };
}
