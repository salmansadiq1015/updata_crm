/**
 * Workflow graph helpers and publish-time validation (pure, no I/O).
 *
 * Graph shape (React Flow compatible):
 *   nodes: [{ id, type, position: {x,y}, data: { label?, config } }]
 *   edges: [{ id, source, sourceHandle, target }]
 *
 * validateGraph returns { valid, errors, warnings } with i18n codes:
 *   { nodeId?, edgeId?, field?, code }
 */
import { CYCLE_BREAKERS, LIMITS, NODE_CATALOG } from '../workflow.constants.js';
import { validateNodeConfig } from './nodeConfig.js';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function nodeMap(graph) {
  return new Map((graph?.nodes || []).map((n) => [n.id, n]));
}

export function findTrigger(graph) {
  return (graph?.nodes || []).find((n) => NODE_CATALOG[n.type]?.category === 'trigger') || null;
}

/** Target node id for (source, port), or null. */
export function nextNodeId(graph, sourceId, port) {
  const edge = (graph?.edges || []).find((e) => e.source === sourceId && (e.sourceHandle || 'out') === port);
  return edge ? edge.target : null;
}

export function outgoingPorts(graph, sourceId) {
  return new Set((graph?.edges || []).filter((e) => e.source === sourceId).map((e) => e.sourceHandle || 'out'));
}

/** Tarjan SCC — returns strongly connected components with >1 node or a self loop. */
function cycles(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source).push(e.target);
  let index = 0; const stack = []; const onStack = new Set(); const idx = new Map(); const low = new Map(); const out = [];
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index += 1; stack.push(v); onStack.add(v);
    for (const w of adj.get(v)) {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []; let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      if (comp.length > 1 || adj.get(v).includes(v)) out.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n.id)) strong(n.id);
  return out;
}

export function validateGraph(graph) {
  const errors = []; const warnings = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  if (!nodes.length) { errors.push({ code: 'graph_empty' }); return { valid: false, errors, warnings }; }
  if (nodes.length > LIMITS.maxNodes) errors.push({ code: 'too_many_nodes' });
  if (edges.length > LIMITS.maxEdges) errors.push({ code: 'too_many_edges' });

  const byId = new Map();
  for (const node of nodes) {
    if (!node || !ID.test(String(node.id || ''))) { errors.push({ nodeId: node?.id ?? null, code: 'node_id_invalid' }); continue; }
    if (byId.has(node.id)) { errors.push({ nodeId: node.id, code: 'node_id_duplicate' }); continue; }
    byId.set(node.id, node);
    if (!NODE_CATALOG[node.type]) { errors.push({ nodeId: node.id, code: 'node_type_unknown' }); continue; }
    errors.push(...validateNodeConfig(node.id, node.type, node.data?.config));
  }

  const triggers = nodes.filter((n) => NODE_CATALOG[n.type]?.category === 'trigger');
  if (triggers.length === 0) errors.push({ code: 'trigger_missing' });
  if (triggers.length > 1) triggers.slice(1).forEach((t) => errors.push({ nodeId: t.id, code: 'trigger_multiple' }));

  const seenEdgeIds = new Set(); const seenPorts = new Set();
  for (const edge of edges) {
    const edgeId = edge?.id;
    if (!edge || !ID.test(String(edgeId || '')) || seenEdgeIds.has(edgeId)) { errors.push({ edgeId: edgeId ?? null, code: 'edge_invalid' }); continue; }
    seenEdgeIds.add(edgeId);
    const source = byId.get(edge.source); const target = byId.get(edge.target);
    if (!source || !target) { errors.push({ edgeId, code: 'edge_dangling' }); continue; }
    if (edge.source === edge.target) { errors.push({ edgeId, nodeId: edge.source, code: 'edge_self_loop' }); continue; }
    const port = edge.sourceHandle || 'out';
    if (!(NODE_CATALOG[source.type]?.outputs || []).includes(port)) { errors.push({ edgeId, nodeId: source.id, code: 'edge_port_invalid' }); continue; }
    if (NODE_CATALOG[target.type]?.category === 'trigger') { errors.push({ edgeId, nodeId: target.id, code: 'edge_into_trigger' }); continue; }
    const portKey = `${edge.source}:${port}`;
    if (seenPorts.has(portKey)) errors.push({ edgeId, nodeId: source.id, code: 'edge_port_duplicate' });
    seenPorts.add(portKey);
  }

  // Reachability from the trigger.
  const trigger = triggers[0];
  if (trigger) {
    const reached = new Set([trigger.id]); const queue = [trigger.id];
    while (queue.length) {
      const id = queue.shift();
      for (const e of edges) if (e.source === id && byId.has(e.target) && !reached.has(e.target)) { reached.add(e.target); queue.push(e.target); }
    }
    for (const node of byId.values()) if (!reached.has(node.id)) errors.push({ nodeId: node.id, code: 'node_unreachable' });
    if (!edges.some((e) => e.source === trigger.id)) errors.push({ nodeId: trigger.id, code: 'trigger_not_connected' });
  }

  // Branch completeness.
  for (const node of byId.values()) {
    const meta = NODE_CATALOG[node.type]; if (!meta) continue;
    const ports = outgoingPorts({ edges }, node.id);
    if (node.type === 'logic.condition') {
      if (!ports.size) errors.push({ nodeId: node.id, code: 'condition_no_branch' });
      else if (!ports.has('yes') || !ports.has('no')) warnings.push({ nodeId: node.id, code: 'condition_branch_missing' });
    } else if (meta.category !== 'end' && meta.category !== 'trigger' && !ports.size && !node.data?.config?.intentionalEnd) {
      // "Intentional end" lets the user acknowledge that the run is meant to stop here.
      warnings.push({ nodeId: node.id, code: 'node_dead_end' });
    } else if (meta.category !== 'end' && meta.category !== 'trigger' && ports.size && !node.data?.config?.intentionalEnd) {
      const open = (meta.outputs || []).filter((p) => !ports.has(p));
      if (open.length) warnings.push({ nodeId: node.id, code: 'branch_unconnected', ports: open, severity: 'info' });
    }
  }
  if (![...byId.values()].some((n) => n.type === 'end')) warnings.push({ code: 'end_missing' });

  // Loops must wait (delay / wait / call) before revisiting a node.
  for (const comp of cycles([...byId.values()], edges.filter((e) => byId.has(e.source) && byId.has(e.target)))) {
    if (!comp.some((id) => CYCLE_BREAKERS.includes(byId.get(id)?.type))) {
      comp.forEach((id) => errors.push({ nodeId: id, code: 'unsafe_loop' }));
    } else warnings.push({ nodeId: comp[0], code: 'loop_present' });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Strip anything the engine does not need from a client graph (positions kept for the inspector). */
export function sanitizeGraph(graph) {
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).slice(0, LIMITS.maxNodes + 1).map((n) => ({
    id: String(n?.id ?? ''),
    type: String(n?.type ?? ''),
    position: { x: Number(n?.position?.x) || 0, y: Number(n?.position?.y) || 0 },
    data: {
      label: typeof n?.data?.label === 'string' ? n.data.label.slice(0, 120) : '',
      config: n?.data?.config && typeof n.data.config === 'object' ? JSON.parse(JSON.stringify(n.data.config)) : {},
    },
  }));
  const edges = (Array.isArray(graph?.edges) ? graph.edges : []).slice(0, LIMITS.maxEdges + 1).map((e) => ({
    id: String(e?.id ?? ''),
    source: String(e?.source ?? ''),
    sourceHandle: e?.sourceHandle ? String(e.sourceHandle) : 'out',
    target: String(e?.target ?? ''),
  }));
  return { nodes, edges };
}
