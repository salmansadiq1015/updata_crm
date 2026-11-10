'use client';
import '@xyflow/react/dist/style.css';
import './workflow-canvas.css';
import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useWorkflowCatalog } from '../../hooks/use-workflows';
import { CATEGORY_STYLES, visualFor } from '../../lib/node-registry';
import { outputsFromCatalog, toFlow } from '../../lib/graph-utils';
import { WorkflowNodeCard, type RuntimeState } from './workflow-node-card';
import { WorkflowEdge } from './workflow-edge';
import type { RunStatus, RunStep, WorkflowGraph } from '../../types/workflow-types';

export interface DiagramRun { steps: RunStep[]; currentNodeId: string | null; status: RunStatus }

/** Per-node runtime state of a run, used by the inspector overlay. */
export function runtimeStates(run: DiagramRun): Map<string, { state: RuntimeState; visits: number; ports: string[] }> {
  const out = new Map<string, { state: RuntimeState; visits: number; ports: string[] }>();
  for (const step of run.steps) {
    const prev = out.get(step.nodeId);
    const state: RuntimeState = step.status === 'completed' ? 'completed' : step.status === 'failed' ? 'failed' : step.status === 'skipped' ? 'skipped' : step.status === 'waiting' ? 'waiting' : 'current';
    out.set(step.nodeId, { state, visits: (prev?.visits || 0) + 1, ports: [...(prev?.ports || []), ...(step.port ? [step.port] : [])] });
  }
  if (run.currentNodeId && ['running', 'waiting', 'queued', 'paused'].includes(run.status)) {
    const cur = out.get(run.currentNodeId);
    if (cur && cur.state === 'completed') cur.state = 'current';
  }
  return out;
}

const nodeTypesFor = (types: string[]) => Object.fromEntries(types.map((t) => [t, WorkflowNodeCard]));
const edgeTypes = { workflow: WorkflowEdge };

interface Props {
  graph: WorkflowGraph | null | undefined;
  run?: DiagramRun | null;
  className?: string;
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  minimap?: boolean;
  controls?: boolean;
  fitPadding?: number;
}

function DiagramInner({ graph, run, className, onNodeClick, selectedNodeId, minimap = false, controls = true, fitPadding = 0.2 }: Props) {
  const { data: catalog } = useWorkflowCatalog();
  const { resolvedTheme } = useTheme();
  const outputs = useMemo(() => outputsFromCatalog(catalog), [catalog]);
  const nodeTypes = useMemo(() => nodeTypesFor((catalog?.nodes || []).map((n) => n.type)), [catalog]);
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const states = run ? runtimeStates(run) : null;
    const flow = toFlow(graph, outputs, (n) => {
      const s = states?.get(n.id);
      return { readOnly: true, runtime: states ? (s?.state || 'pending') : undefined, visits: s?.visits, takenPorts: states ? (s?.ports || []) : undefined };
    });
    const taken = new Set<string>();
    if (run) for (const step of run.steps) if (step.port) taken.add(`${step.nodeId}:${step.port}`);
    return {
      nodes: flow.nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId, draggable: false, connectable: false })),
      edges: flow.edges.map((e) => ({ ...e, selectable: false, data: { ...e.data!, active: run ? taken.has(`${e.source}:${e.sourceHandle}`) : false, dimmed: run ? !taken.has(`${e.source}:${e.sourceHandle}`) : false } })),
    };
  }, [graph, run, outputs, selectedNodeId]);

  if (!catalog) return <Skeleton className={cn('h-full min-h-64 w-full rounded-2xl', className)} />;
  return (
    <div className={cn('wf-canvas relative h-full min-h-64 w-full overflow-hidden rounded-2xl border bg-muted/30 dark:bg-slate-950/40', className)}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
        fitView fitViewOptions={{ padding: fitPadding }} minZoom={0.2} maxZoom={1.5}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={Boolean(onNodeClick)} edgesFocusable={false}
        onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} className="!text-slate-300 dark:!text-slate-700" color="currentColor" />
        {controls && <Controls showInteractive={false} position="bottom-right" />}
        {minimap && <MiniMap pannable zoomable nodeColor={(n) => CATEGORY_STYLES[visualFor(n.type || '').category].minimap} maskColor="rgb(15 23 42 / 0.08)" />}
      </ReactFlow>
    </div>
  );
}

export function WorkflowDiagram(props: Props) {
  return <ReactFlowProvider><DiagramInner {...props} /></ReactFlowProvider>;
}
