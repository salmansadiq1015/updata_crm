import { MarkerType } from '@xyflow/react';
import type { CanvasEdge, CanvasEdgeData } from '../ui/shared/workflow-edge';
import type { CanvasNode, CanvasNodeData } from '../ui/shared/workflow-node-card';
import type { NodeCatalogEntry, ValidationIssue, WorkflowEdge, WorkflowGraph, WorkflowNode } from '../types/workflow-types';

export const EDGE_TYPE = 'workflow';
export const NODE_WIDTH = 304;
export const NODE_HEIGHT = 150;

export function newId(prefix = 'n') {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export type OutputsByType = Record<string, string[]>;
export const outputsFromCatalog = (catalog?: { nodes: NodeCatalogEntry[] } | null): OutputsByType =>
  Object.fromEntries((catalog?.nodes || []).map((n) => [n.type, n.outputs]));

export function edgeFor(e: WorkflowEdge, extra: Partial<CanvasEdgeData> = {}): CanvasEdge {
  return {
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || 'out', targetHandle: 'in', type: EDGE_TYPE,
    data: { port: e.sourceHandle || 'out', ...extra },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  };
}

export function toFlow(graph: WorkflowGraph, outputs: OutputsByType, extra: (n: WorkflowNode) => Partial<CanvasNodeData> = () => ({})): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: (graph?.nodes || []).map((n) => ({
      id: n.id, type: n.type, position: n.position || { x: 0, y: 0 },
      data: { label: n.data?.label || '', config: n.data?.config || {}, outputs: outputs[n.type] || ['out'], ...extra(n) },
    })),
    edges: (graph?.edges || []).map((e) => edgeFor(e)),
  };
}

export function fromFlow(nodes: CanvasNode[], edges: CanvasEdge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type || 'end', position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { label: n.data.label || '', config: n.data.config || {} } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle || 'out' })),
  };
}

/** Stable JSON for dirty-checking (ignores key order noise in positions). */
export const graphSignature = (g: WorkflowGraph) => JSON.stringify(g);

/**
 * Layered auto-layout: depth = BFS distance from the trigger; siblings ordered by their
 * parent's port order so YES stays left of NO; back edges (loops) ignored.
 */
export function autoLayout(graph: WorkflowGraph, outputs: OutputsByType, { colGap = 64, rowGap = 84 } = {}): WorkflowGraph {
  const nodes = graph.nodes;
  if (!nodes.length) return graph;
  const trigger = nodes.find((n) => n.type.startsWith('trigger.')) || nodes[0];
  const depth = new Map<string, number>([[trigger.id, 0]]);
  const order: string[] = [trigger.id];
  const portIndex = (e: WorkflowEdge) => {
    const src = nodes.find((n) => n.id === e.source);
    return src ? (outputs[src.type] || []).indexOf(e.sourceHandle || 'out') : 0;
  };
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    const out = graph.edges.filter((e) => e.source === id).sort((a, b) => portIndex(a) - portIndex(b));
    for (const e of out) if (!depth.has(e.target)) { depth.set(e.target, (depth.get(id) || 0) + 1); order.push(e.target); }
  }
  // Disconnected nodes go below everything else.
  let maxDepth = Math.max(...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) { maxDepth += 1; depth.set(n.id, maxDepth); order.push(n.id); }
  const rows = new Map<number, string[]>();
  for (const id of order) { const d = depth.get(id) || 0; rows.set(d, [...(rows.get(d) || []), id]); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of rows) {
    const width = ids.length * NODE_WIDTH + (ids.length - 1) * colGap;
    ids.forEach((id, i) => pos.set(id, { x: -width / 2 + i * (NODE_WIDTH + colGap), y: d * (NODE_HEIGHT + rowGap) }));
  }
  return { ...graph, nodes: nodes.map((n) => ({ ...n, position: pos.get(n.id) || n.position })) };
}

export function issuesByNode(issues: ValidationIssue[] = []) {
  const map = new Map<string, ValidationIssue[]>();
  for (const i of issues) if (i.nodeId) map.set(i.nodeId, [...(map.get(i.nodeId) || []), i]);
  return map;
}
