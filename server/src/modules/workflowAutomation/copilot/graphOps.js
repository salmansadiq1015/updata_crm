/**
 * Structured, validated workflow edits (pure). The Workflow Copilot can ONLY change a
 * workflow through these operations; each returns the new graph plus a description of the
 * change, or throws an OpError whose message is fed back to the model so it can correct
 * itself. Nothing here touches the database.
 */
import crypto from 'node:crypto';
import { LIMITS, NODE_CATALOG } from '../workflow.constants.js';
import { normalizeConfig, validateNodeConfig } from '../engine/nodeConfig.js';

export class OpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COL = 300; const ROW = 200;
const clone = (g) => JSON.parse(JSON.stringify(g));
const findNode = (g, id) => g.nodes.find((n) => n.id === id);
const isTrigger = (type) => NODE_CATALOG[type]?.category === 'trigger';

function requireNode(g, id, role = 'node') {
  const node = findNode(g, id);
  if (!node) throw new OpError('unknown_node', `No step with id "${id}" (${role}). Existing ids: ${g.nodes.map((n) => n.id).join(', ') || 'none'}`);
  return node;
}

function newNodeId(g, type) {
  const base = type.split('.').pop().replace(/[^a-z0-9_]/gi, '').slice(0, 12) || 'step';
  let id;
  do { id = `${base}_${crypto.randomBytes(3).toString('hex')}`; } while (findNode(g, id));
  return id;
}

/** Free spot near (x, y): shift right until no node overlaps. */
function freeSpot(g, x, y) {
  let px = x;
  for (let i = 0; i < 40; i += 1) {
    if (!g.nodes.some((n) => Math.abs(n.position.x - px) < COL - 20 && Math.abs(n.position.y - y) < ROW - 60)) return { x: px, y };
    px += COL;
  }
  return { x: px, y };
}

/**
 * Resource guard: ids the model puts into a config must exist in the CRM.
 * resources: { agents: Map(id→agent), templates: Map(id→tpl), users: Map(id→user) }
 */
function checkResources(type, config, resources) {
  if (!resources) return;
  const agent = (id) => resources.agents.get(String(id));
  if (['ai.call', 'ai.callback', 'trigger.call_completed'].includes(type) && config.agentId) {
    const a = agent(config.agentId);
    if (!a) throw new OpError('unknown_agent', `Agent "${config.agentId}" does not exist. Use one of: ${[...resources.agents.values()].map((x) => `${x.id} (${x.name})`).join(', ') || 'none — ask the user to create an agent first'}`);
    if (type === 'ai.call' && a.usage === 'inbound') throw new OpError('agent_inbound_only', `${a.name} only answers incoming calls; choose an outbound agent.`);
  }
  if (type.startsWith('msg.') && config.templateId) {
    const tpl = resources.templates.get(String(config.templateId));
    const channel = NODE_CATALOG[type].channel;
    if (!tpl) throw new OpError('unknown_template', `Template "${config.templateId}" does not exist.`);
    if (tpl.channel !== channel) throw new OpError('template_channel_mismatch', `Template "${tpl.name}" is for ${tpl.channel}, not ${channel}.`);
  }
  const userIds = [config.userId, ...(Array.isArray(config.userIds) ? config.userIds : [])].filter(Boolean);
  for (const u of userIds) if (!resources.users.get(String(u))) throw new OpError('unknown_user', `User "${u}" does not exist.`);
}

function sanitizeConfig(config) {
  if (config === undefined || config === null) return {};
  if (typeof config !== 'object' || Array.isArray(config)) throw new OpError('invalid_config', 'config must be an object');
  const json = JSON.stringify(config);
  if (json.length > 20_000) throw new OpError('invalid_config', 'config is too large');
  if (/"\$[a-z]/i.test(json)) throw new OpError('invalid_config', 'config keys may not start with $');
  return JSON.parse(json);
}

const issuesFor = (node) => validateNodeConfig(node.id, node.type, node.data.config).map((i) => `${i.field}: ${i.code}`);

export function addNode(graph, { type, label = '', config = {}, after = null, id = null }, resources) {
  if (!NODE_CATALOG[type]) throw new OpError('unknown_type', `Unknown step type "${type}".`);
  const g = clone(graph);
  if (g.nodes.length >= LIMITS.maxNodes) throw new OpError('too_many_nodes', 'The workflow has reached the step limit.');
  if (isTrigger(type) && g.nodes.some((n) => isTrigger(n.type))) throw new OpError('trigger_exists', 'The workflow already has a trigger. Update it with update_node instead.');
  const cfg = sanitizeConfig(config);
  checkResources(type, cfg, resources);
  if (id && (!ID.test(id) || findNode(g, id))) throw new OpError('bad_id', `Id "${id}" is invalid or already used.`);
  const nodeId = id || newNodeId(g, type);
  let position;
  let edge = null;
  if (after?.node) {
    const src = requireNode(g, after.node, 'after.node');
    const ports = NODE_CATALOG[src.type].outputs;
    const port = after.port || ports[0];
    if (!ports.includes(port)) throw new OpError('bad_port', `"${src.type}" has no branch "${port}". Branches: ${ports.join(', ') || 'none'}`);
    const idx = ports.indexOf(port);
    position = freeSpot(g, src.position.x + (idx - (ports.length - 1) / 2) * COL, src.position.y + ROW);
    edge = { id: `e_${src.id}_${port}_${nodeId}`.slice(0, 64), source: src.id, sourceHandle: port, target: nodeId };
    if (isTrigger(type)) throw new OpError('edge_into_trigger', 'A trigger cannot follow another step.');
  } else {
    const maxY = g.nodes.length ? Math.max(...g.nodes.map((n) => n.position.y)) + ROW : 0;
    position = freeSpot(g, 0, isTrigger(type) ? Math.min(0, ...g.nodes.map((n) => n.position.y - ROW)) : maxY);
  }
  const node = { id: nodeId, type, position, data: { label: String(label || '').slice(0, 120), config: normalizeConfig(type, cfg) } };
  g.nodes.push(node);
  if (edge) {
    g.edges = g.edges.filter((e) => !(e.source === edge.source && (e.sourceHandle || 'out') === edge.sourceHandle));
    g.edges.push(edge);
  }
  return { graph: g, change: { kind: 'add_node', nodeId, type, connectedFrom: edge ? { node: edge.source, port: edge.sourceHandle } : null, issues: issuesFor(node) } };
}

export function updateNode(graph, { node: id, label, config, replaceConfig = false }, resources) {
  const g = clone(graph);
  const node = requireNode(g, id);
  if (label !== undefined) node.data.label = String(label || '').slice(0, 120);
  if (config !== undefined) {
    const cfg = sanitizeConfig(config);
    const merged = replaceConfig ? cfg : { ...node.data.config, ...cfg };
    checkResources(node.type, merged, resources);
    node.data.config = normalizeConfig(node.type, merged);
  }
  return { graph: g, change: { kind: 'update_node', nodeId: id, issues: issuesFor(node) } };
}

export function connectNodes(graph, { from, port, to }) {
  const g = clone(graph);
  const src = requireNode(g, from, 'from');
  const dst = requireNode(g, to, 'to');
  const ports = NODE_CATALOG[src.type].outputs;
  const p = port || ports[0];
  if (!ports.includes(p)) throw new OpError('bad_port', `"${src.type}" has no branch "${p}". Branches: ${ports.join(', ') || 'none (end steps have no branches)'}`);
  if (src.id === dst.id) throw new OpError('self_loop', 'A step cannot connect to itself.');
  if (isTrigger(dst.type)) throw new OpError('edge_into_trigger', 'Nothing can connect into the trigger.');
  const replaced = g.edges.find((e) => e.source === src.id && (e.sourceHandle || 'out') === p) || null;
  g.edges = g.edges.filter((e) => e !== replaced);
  g.edges.push({ id: `e_${src.id}_${p}_${dst.id}`.slice(0, 64), source: src.id, sourceHandle: p, target: dst.id });
  return { graph: g, change: { kind: 'connect', from: src.id, port: p, to: dst.id, replacedTarget: replaced?.target || null } };
}

export function disconnect(graph, { from, port }) {
  const g = clone(graph);
  requireNode(g, from, 'from');
  const before = g.edges.length;
  g.edges = g.edges.filter((e) => !(e.source === from && (e.sourceHandle || 'out') === (port || 'out')));
  if (g.edges.length === before) throw new OpError('no_connection', `Branch "${port}" of "${from}" is not connected.`);
  return { graph: g, change: { kind: 'disconnect', from, port } };
}

export function removeNode(graph, { node: id }) {
  const g = clone(graph);
  requireNode(g, id);
  g.nodes = g.nodes.filter((n) => n.id !== id);
  g.edges = g.edges.filter((e) => e.source !== id && e.target !== id);
  return { graph: g, change: { kind: 'remove_node', nodeId: id } };
}

/** Layered layout (trigger on top, branches left→right in port order). */
export function tidyLayout(graph) {
  const g = clone(graph);
  const trigger = g.nodes.find((n) => isTrigger(n.type)) || g.nodes[0];
  if (!trigger) return { graph: g, change: { kind: 'layout' } };
  const depth = new Map([[trigger.id, 0]]); const order = [trigger.id];
  for (let i = 0; i < order.length; i += 1) {
    const src = findNode(g, order[i]);
    const ports = NODE_CATALOG[src.type]?.outputs || [];
    const out = g.edges.filter((e) => e.source === src.id).sort((a, b) => ports.indexOf(a.sourceHandle) - ports.indexOf(b.sourceHandle));
    for (const e of out) if (!depth.has(e.target)) { depth.set(e.target, depth.get(src.id) + 1); order.push(e.target); }
  }
  let extra = Math.max(...depth.values());
  for (const n of g.nodes) if (!depth.has(n.id)) { extra += 1; depth.set(n.id, extra); order.push(n.id); }
  const rows = new Map();
  for (const id of order) rows.set(depth.get(id), [...(rows.get(depth.get(id)) || []), id]);
  for (const [d, ids] of rows) ids.forEach((id, i) => { findNode(g, id).position = { x: (i - (ids.length - 1) / 2) * COL, y: d * ROW }; });
  return { graph: g, change: { kind: 'layout' } };
}

export const OPS = { add_node: addNode, update_node: updateNode, connect_nodes: connectNodes, disconnect, remove_node: removeNode, tidy_layout: tidyLayout };
