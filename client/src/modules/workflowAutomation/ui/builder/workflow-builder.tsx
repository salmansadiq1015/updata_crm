'use client';
import '@xyflow/react/dist/style.css';
import '../shared/workflow-canvas.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, addEdge,
  useEdgesState, useNodesState, useReactFlow, type Connection, type IsValidConnection, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import { ListChecks, LayoutTemplate, Settings2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useWorkflow, useWorkflowCatalog, useWorkflowMutations } from '../../hooks/use-workflows';
import { useAgentOptions, useDirectoryUsers } from '../../hooks/use-lookups';
import { useMediaQuery } from '../../hooks/use-media-query';
import { workflowApi } from '../../services/workflow-api';
import { CATEGORY_STYLES, visualFor } from '../../lib/node-registry';
import { summarizeNode } from '../../lib/node-summary';
import { autoLayout, edgeFor, fromFlow, graphSignature, issuesByNode, newId, outputsFromCatalog, toFlow, EDGE_TYPE } from '../../lib/graph-utils';
import { WorkflowNodeCard, type CanvasNode } from '../shared/workflow-node-card';
import { WorkflowEdge, type CanvasEdge } from '../shared/workflow-edge';
import { runtimeStates } from '../shared/workflow-diagram';
import { NodePalette, DND_MIME } from './node-palette';
import { ConfigPanel } from './config-panel';
import { BuilderToolbar } from './builder-toolbar';
import { TestRunDialog } from './test-run-dialog';
import { PublishDialog } from './publish-dialog';
import { VersionsSheet } from './versions-sheet';
import { CopilotPanel, type CopilotHelpRequest } from './copilot-panel';
import { PanelResizer, clampWidth } from './panel-resizer';
import { ValidationPanel, type QuickFix } from './validation-panel';
import { NODE_CARD_WIDTH } from '../shared/workflow-node-card';
import type { TestRunResult, ValidationResult, WorkflowGraph, WorkflowSettings } from '../../types/workflow-types';

const edgeTypes = { [EDGE_TYPE]: WorkflowEdge };
const HISTORY_LIMIT = 80;
const DEFAULT_SETTINGS: WorkflowSettings = { reentry: 'after_completion', stopOnOptOut: true };
const HALF = NODE_CARD_WIDTH / 2;
const PREFS_KEY = 'updata.wf-builder.prefs';
type RightPanel = 'config' | 'copilot' | 'validation';
interface Prefs { recent: string[]; favorites: string[]; minimap: boolean; autosave: boolean; panelWidth?: number | null; copilotReview?: boolean }

function readPrefs(): Prefs {
  try { return { recent: [], favorites: [], minimap: true, autosave: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { recent: [], favorites: [], minimap: true, autosave: true }; }
}

export function WorkflowBuilder({ workflowId }: { workflowId: string }) {
  return <ReactFlowProvider><BuilderInner workflowId={workflowId} /></ReactFlowProvider>;
}

function BuilderInner({ workflowId }: { workflowId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { hasPermission } = usePermissions();
  const flow = useReactFlow<CanvasNode, CanvasEdge>();
  const { data: wf, isLoading, error, refetch } = useWorkflow(workflowId);
  const { data: catalog } = useWorkflowCatalog();
  const { agents } = useAgentOptions();
  const { data: users = [] } = useDirectoryUsers('');
  const mutations = useWorkflowMutations();
  const wide = useMediaQuery('(min-width: 1280px)'); // xl: the config panel is docked, no sheet
  const large = useMediaQuery('(min-width: 1024px)'); // lg: the palette is docked

  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<CanvasEdge>([]);
  const [meta, setMeta] = useState({ name: '', description: '', settings: DEFAULT_SETTINGS });
  const [baseRevision, setBaseRevision] = useState<number>(0);
  const [savedSig, setSavedSig] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [dialog, setDialog] = useState<'test' | 'publish' | 'versions' | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('config');
  const [prefs, setPrefsState] = useState<Prefs>(() => (typeof window === 'undefined' ? { recent: [], favorites: [], minimap: true, autosave: true } : readPrefs()));
  const setPrefs = useCallback((fn: (p: Prefs) => Prefs) => setPrefsState((p) => { const next = fn(p); try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } return next; }), []);
  const [testNodeId, setTestNodeId] = useState<string | null>(null);
  const [helpRequest, setHelpRequest] = useState<CopilotHelpRequest | null>(null);
  const [aiFlash, setAiFlash] = useState<Set<string>>(new Set());
  const copilotBusy = useRef(false);
  const turnSnapshots = useRef(new Map<string, WorkflowGraph>());
  const past = useRef<WorkflowGraph[]>([]);
  const future = useRef<WorkflowGraph[]>([]);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const forceHistory = useCallback(() => setHist({ past: past.current.length, future: future.current.length }), []);
  const clipboard = useRef<WorkflowGraph | null>(null);
  const lastConfigPush = useRef<{ id: string; at: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const readOnly = !hasPermission('workflow:write') || wf?.status === 'archived';
  const canPublish = hasPermission('workflow:publish') && wf?.status !== 'archived';
  const outputs = useMemo(() => outputsFromCatalog(catalog), [catalog]);
  const nodeTypes = useMemo(() => Object.fromEntries((catalog?.nodes || []).map((n) => [n.type, WorkflowNodeCard])), [catalog]);

  // ----------------------------------------------------------------- load
  // Compare like with like: run server graphs through the canvas serializer (key order, rounding).
  const normalizedSig = useCallback((g: WorkflowGraph) => { const f = toFlow(g, outputs); return graphSignature(fromFlow(f.nodes, f.edges)); }, [outputs]);
  const loadGraph = useCallback((graph: WorkflowGraph) => {
    const f = toFlow(graph, outputs);
    setNodes(f.nodes); setEdges(f.edges);
  }, [outputs, setNodes, setEdges]);

  useEffect(() => {
    if (!wf || !catalog || loadedFor === `${wf._id}:${wf.draftRevision}`) return;
    if (loadedFor && loadedFor.startsWith(`${wf._id}:`)) return; // already editing; don't clobber local edits on refetch
    // Graphs created through the API may have no layout (every node at the same spot): arrange them.
    const stacked = wf.draft.nodes.length > 1 && new Set(wf.draft.nodes.map((n) => `${Math.round(n.position?.x || 0)},${Math.round(n.position?.y || 0)}`)).size === 1;
    loadGraph(stacked ? autoLayout(wf.draft, outputs) : wf.draft);
    const m = { name: wf.name, description: wf.description || '', settings: { ...DEFAULT_SETTINGS, ...(wf.settings || {}) } };
    setMeta(m);
    setBaseRevision(wf.draftRevision);
    setSavedSig(normalizedSig(wf.draft) + JSON.stringify(m));
    setLoadedFor(`${wf._id}:${wf.draftRevision}`);
    past.current = []; future.current = []; setHist({ past: 0, future: 0 });
    requestAnimationFrame(() => flow.fitView({ padding: 0.2, maxZoom: 1 }));
  }, [wf, catalog, loadedFor, loadGraph, flow, outputs, normalizedSig]);

  const graph = useMemo(() => fromFlow(nodes, edges), [nodes, edges]);
  const currentSig = useMemo(() => graphSignature(graph) + JSON.stringify(meta), [graph, meta]);
  const dirty = Boolean(loadedFor) && currentSig !== savedSig;
  const graphSig = useMemo(() => graphSignature(graph), [graph]);

  // ----------------------------------------------------------------- live validation (server = source of truth)
  useEffect(() => {
    if (!loadedFor || readOnly) return;
    const handle = setTimeout(() => {
      workflowApi.validate(workflowId, JSON.parse(graphSig)).then(setValidation).catch(() => { /* keep last result */ });
    }, 600);
    return () => clearTimeout(handle);
  }, [graphSig, loadedFor, readOnly, workflowId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ----------------------------------------------------------------- history
  const snapshot = useCallback(() => fromFlow(flow.getNodes(), flow.getEdges()), [flow]);
  const pushHistory = useCallback(() => {
    past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), snapshot()];
    future.current = [];
    forceHistory();
  }, [snapshot, forceHistory]);
  const undo = useCallback(() => {
    const prev = past.current.pop(); if (!prev) return;
    future.current.push(snapshot()); loadGraph(prev); forceHistory();
  }, [snapshot, loadGraph, forceHistory]);
  const redo = useCallback(() => {
    const next = future.current.pop(); if (!next) return;
    past.current.push(snapshot()); loadGraph(next); forceHistory();
  }, [snapshot, loadGraph, forceHistory]);

  // ----------------------------------------------------------------- canvas handlers
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    if (readOnly) changes = changes.filter((c) => c.type === 'select' || c.type === 'dimensions');
    if (changes.some((c) => c.type === 'remove')) pushHistory();
    onNodesChangeRaw(changes);
  }, [onNodesChangeRaw, pushHistory, readOnly]);
  const onEdgesChange = useCallback((changes: EdgeChange<CanvasEdge>[]) => {
    if (readOnly) changes = changes.filter((c) => c.type === 'select');
    if (changes.some((c) => c.type === 'remove')) pushHistory();
    onEdgesChangeRaw(changes);
  }, [onEdgesChangeRaw, pushHistory, readOnly]);

  const isValidConnection: IsValidConnection<CanvasEdge> = useCallback((c) => {
    if (!c.source || !c.target || c.source === c.target) return false;
    const target = flow.getNode(c.target);
    return Boolean(target && !String(target.type).startsWith('trigger.'));
  }, [flow]);

  const onConnect = useCallback((c: Connection) => {
    if (readOnly) return;
    pushHistory();
    const port = c.sourceHandle || 'out';
    // One connection per branch: a new connection replaces the old one.
    setEdges((eds) => addEdge(edgeFor({ id: newId('e'), source: c.source, target: c.target, sourceHandle: port }), eds.filter((e) => !(e.source === c.source && (e.sourceHandle || 'out') === port))));
  }, [pushHistory, readOnly, setEdges]);

  const deleteEdge = useCallback((id: string) => { pushHistory(); setEdges((eds) => eds.filter((e) => e.id !== id)); }, [pushHistory, setEdges]);

  const addNode = useCallback((type: string, position?: { x: number; y: number }, connectFrom?: string | null) => {
    if (readOnly || !catalog) return;
    if (type.startsWith('trigger.') && flow.getNodes().some((n) => String(n.type).startsWith('trigger.'))) { showError(t('workflowBuilder.palette.oneTrigger', 'A workflow has exactly one trigger.')); return; }
    pushHistory();
    const entry = catalog.nodes.find((n) => n.type === type);
    const source = connectFrom ? flow.getNode(connectFrom) : null;
    let pos = position;
    if (!pos && source) pos = { x: source.position.x, y: source.position.y + 190 };
    if (!pos) {
      const rect = wrapper.current?.getBoundingClientRect();
      pos = flow.screenToFlowPosition({ x: (rect?.left || 0) + (rect?.width || 800) / 2 - HALF, y: (rect?.top || 0) + (rect?.height || 600) / 3 });
    }
    const id = newId(type.split('.').pop()?.slice(0, 8) || 'n');
    const node: CanvasNode = { id, type, position: pos, selected: true, data: { label: '', config: { ...(entry?.defaults || {}) }, outputs: outputs[type] || ['out'] } };
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    if (source && !String(type).startsWith('trigger.')) {
      const used = new Set(flow.getEdges().filter((e) => e.source === source.id).map((e) => e.sourceHandle || 'out'));
      const port = (outputs[source.type || ''] || []).find((p) => !used.has(p));
      if (port) setEdges((eds) => [...eds, edgeFor({ id: newId('e'), source: source.id, target: id, sourceHandle: port })]);
    }
    setSelectedId(id);
    setRightPanel('config');
    setPaletteOpen(false);
    setPrefs((p) => ({ ...p, recent: [type, ...p.recent.filter((x) => x !== type)].slice(0, 8) }));
  }, [readOnly, catalog, flow, pushHistory, outputs, setNodes, setEdges, t, setPrefs]);

  /** Quick fixes from the validation panel / step inspector. */
  const applyFix = useCallback((fix: QuickFix) => {
    if (readOnly || !catalog) return;
    if (fix.kind === 'add_trigger') { addNode('trigger.manual'); return; }
    if (fix.kind === 'add_end_free') { addNode('end'); return; }
    if (fix.kind === 'intentional_end') {
      const n = flow.getNode(fix.nodeId); if (!n) return;
      pushHistory();
      setNodes((ns) => ns.map((x) => (x.id === fix.nodeId ? { ...x, data: { ...x.data, config: { ...x.data.config, intentionalEnd: true } } } : x)));
      return;
    }
    const src = flow.getNode(fix.nodeId); if (!src) return;
    pushHistory();
    const ports = outputs[src.type || ''] || [];
    const idx = Math.max(0, ports.indexOf(fix.port));
    const id = newId('end');
    const endDefaults = catalog.nodes.find((x) => x.type === 'end')?.defaults || { outcome: 'completed' };
    const outcome = ({ blocked: 'opted_out', unanswered: 'unreachable', failed: 'failed', not_qualified: 'not_qualified', qualified: 'qualified', timeout: 'completed' } as Record<string, string>)[fix.port] || 'completed';
    // Free spot below the branch: shift sideways until no existing step overlaps.
    const all = flow.getNodes();
    let px = src.position.x + (idx - (ports.length - 1) / 2) * (NODE_CARD_WIDTH + 40); const py = src.position.y + 230;
    for (let i = 0; i < 30 && all.some((x) => Math.abs(x.position.x - px) < NODE_CARD_WIDTH + 20 && Math.abs(x.position.y - py) < 150); i += 1) px += NODE_CARD_WIDTH + 40;
    const node: CanvasNode = { id, type: 'end', position: { x: px, y: py }, data: { label: '', config: { ...endDefaults, outcome, updateLeadStatus: false }, outputs: [] } };
    setNodes((ns) => [...ns, node]);
    setEdges((es) => [...es.filter((e) => !(e.source === src.id && (e.sourceHandle || 'out') === fix.port)), edgeFor({ id: newId('e'), source: src.id, target: id, sourceHandle: fix.port })]);
  }, [readOnly, catalog, flow, pushHistory, outputs, setNodes, setEdges, addNode]);

  // ----------------------------------------------------------------- copilot
  const flash = useCallback((id: string | null) => {
    if (!id) return;
    setAiFlash((s0) => new Set(s0).add(id));
    setTimeout(() => setAiFlash((s0) => { const s1 = new Set(s0); s1.delete(id); return s1; }), 1800);
  }, []);
  const applyCopilotGraph = useCallback((g: WorkflowGraph, touched: string | null) => {
    const f = toFlow(g, outputs);
    setNodes(f.nodes); setEdges(f.edges);
    flash(touched);
    if (touched) {
      const n = f.nodes.find((x) => x.id === touched);
      if (n) {
        // Keep the step being built in view without jumping around.
        const vp = flow.getViewport();
        const rect = wrapper.current?.getBoundingClientRect();
        const sx = n.position.x * vp.zoom + vp.x; const sy = n.position.y * vp.zoom + vp.y;
        if (rect && (sx < 0 || sy < 0 || sx > rect.width - 120 || sy > rect.height - 120)) flow.setCenter(n.position.x + HALF, n.position.y + 70, { zoom: Math.max(vp.zoom, 0.6), duration: 300 });
      }
    }
  }, [outputs, setNodes, setEdges, flash, flow]);
  const onTurnStart = useCallback((turnId: string) => {
    copilotBusy.current = true;
    turnSnapshots.current.set(turnId, snapshot());
    pushHistory();
  }, [snapshot, pushHistory]);
  const onUndoTurn = useCallback((turnId: string) => {
    const snap = turnSnapshots.current.get(turnId);
    if (!snap) return false;
    pushHistory();
    loadGraph(snap);
    turnSnapshots.current.delete(turnId);
    return true;
  }, [pushHistory, loadGraph]);
  const askAiAbout = useCallback((id: string) => {
    const n = flow.getNode(id); if (!n) return;
    const name = n.data.label || t(`workflow.node.${n.type}.label`, n.type || '');
    setSelectedId(id);
    setRightPanel('copilot');
    setHelpRequest({ text: t('workflowCopilot.helpNode', 'Help me configure the step “{name}”.', { name }), nonce: Date.now() });
  }, [flow, t]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DND_MIME);
    if (!type) return;
    const pos = flow.screenToFlowPosition({ x: e.clientX - HALF, y: e.clientY - 30 });
    addNode(type, pos, null);
  }, [flow, addNode]);

  const updateNode = useCallback((id: string, patch: { label?: string; config?: Record<string, unknown> }) => {
    const now = Date.now();
    if (!lastConfigPush.current || lastConfigPush.current.id !== id || now - lastConfigPush.current.at > 1200) pushHistory();
    lastConfigPush.current = { id, at: now };
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.config ? { config: patch.config } : {}) } } : n)));
  }, [pushHistory, setNodes]);

  const deleteNodes = useCallback((ids: string[]) => {
    if (!ids.length || readOnly) return;
    pushHistory();
    setNodes((ns) => ns.filter((n) => !ids.includes(n.id)));
    setEdges((es) => es.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)));
    setSelectedId(null);
  }, [pushHistory, readOnly, setNodes, setEdges]);

  const copySelection = useCallback(() => {
    const sel = flow.getNodes().filter((n) => n.selected && !String(n.type).startsWith('trigger.'));
    if (!sel.length) return false;
    const ids = new Set(sel.map((n) => n.id));
    clipboard.current = fromFlow(sel, flow.getEdges().filter((e) => ids.has(e.source) && ids.has(e.target)));
    return true;
  }, [flow]);

  const paste = useCallback((offset = 48) => {
    const clip = clipboard.current; if (!clip || readOnly) return;
    pushHistory();
    const map = new Map(clip.nodes.map((n) => [n.id, newId(n.type.split('.').pop()?.slice(0, 8) || 'n')]));
    const newNodes = toFlow({
      nodes: clip.nodes.map((n) => ({ ...n, id: map.get(n.id)!, position: { x: n.position.x + offset, y: n.position.y + offset } })),
      edges: clip.edges.map((e) => ({ ...e, id: newId('e'), source: map.get(e.source)!, target: map.get(e.target)! })),
    }, outputs);
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...newNodes.nodes.map((n) => ({ ...n, selected: true }))]);
    setEdges((es) => [...es, ...newNodes.edges]);
    clipboard.current = { nodes: clip.nodes.map((n) => ({ ...n, position: { x: n.position.x + offset, y: n.position.y + offset } })), edges: clip.edges };
  }, [outputs, pushHistory, readOnly, setNodes, setEdges]);

  const duplicateNode = useCallback((id: string) => {
    const n = flow.getNode(id); if (!n) return;
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
    clipboard.current = fromFlow([n], []);
    paste(40);
  }, [flow, paste, setNodes]);

  const layout = useCallback(() => {
    if (readOnly) return;
    pushHistory();
    loadGraph(autoLayout(snapshot(), outputs));
    requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 400, maxZoom: 1 }));
  }, [readOnly, pushHistory, loadGraph, snapshot, outputs, flow]);

  // ----------------------------------------------------------------- save / publish
  const save = useCallback(async () => {
    if (readOnly || !wf) return null;
    try {
      const saved = await mutations.save.mutateAsync({ id: workflowId, graph: snapshot(), baseRevision, name: meta.name.trim() || wf.name, description: meta.description, settings: meta.settings });
      setBaseRevision(saved.draftRevision);
      setLoadedFor(`${saved._id}:${saved.draftRevision}`);
      // Server may add data (e.g. a generated webhook token): adopt it without disturbing positions/selection.
      setNodes((ns) => ns.map((n) => { const s = saved.draft.nodes.find((x) => x.id === n.id); return s ? { ...n, data: { ...n.data, config: s.data.config } } : n; }));
      setSavedSig(normalizedSig(saved.draft) + JSON.stringify({ ...meta, name: saved.name }));
      setSavedAt(new Date());
      return saved;
    } catch (e) {
      showError(e);
      return null;
    }
  }, [readOnly, wf, mutations.save, workflowId, snapshot, baseRevision, meta, setNodes, normalizedSig]);

  const publish = useCallback(async (notes: string) => {
    if (dirty && !(await save())) return;
    try {
      const r = await mutations.publish.mutateAsync({ id: workflowId, notes });
      showSuccess(t('workflowBuilder.publish.done', 'Version {version} is live', { version: r.publishedVersion }));
      setDialog(null);
    } catch (e) { showError(e); }
  }, [dirty, save, mutations.publish, workflowId, t]);

  const openPublish = useCallback(() => {
    setValidation(null);
    workflowApi.validate(workflowId, snapshot()).then(setValidation).catch(showError);
    setDialog('publish');
  }, [workflowId, snapshot]);

  // ----------------------------------------------------------------- autosave (draft only — never publishes)
  const autosaving = useRef(false);
  useEffect(() => {
    if (!prefs.autosave || readOnly || !dirty || !loadedFor) return;
    const handle = setTimeout(() => {
      if (copilotBusy.current || autosaving.current || mutations.save.isPending) return;
      autosaving.current = true;
      void save().finally(() => { autosaving.current = false; });
    }, 4000);
    return () => clearTimeout(handle);
  }, [currentSig, prefs.autosave, readOnly, dirty, loadedFor, save, mutations.save.isPending]);

  // ----------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'c') { if (copySelection()) e.preventDefault(); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (copySelection()) paste(40); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); }
      else if (e.key === 'Escape') { setSelectedId(null); setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, undo, redo, copySelection, paste, setNodes]);

  // ----------------------------------------------------------------- decorated view
  const lookups = useMemo(() => ({
    agents: new Map(agents.map((a) => [a._id, a.name])),
    agentLanguages: new Map(agents.map((a) => [a._id, String((a as { agentConfig?: { language?: string } }).agentConfig?.language || '')])),
    users: new Map(users.map((u) => [u._id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id])),
    templates: new Map<string, string>(),
  }), [agents, users]);
  const issues = useMemo(() => issuesByNode(validation?.errors), [validation]);
  const warns = useMemo(() => issuesByNode(validation?.warnings), [validation]);
  const testStates = useMemo(() => (testResult ? runtimeStates({ steps: testResult.steps.map((s, i) => ({ _id: String(i), nodeId: s.nodeId, type: s.type, label: s.label || '', visit: 1, attempt: 1, status: s.status === 'completed' ? 'completed' : 'failed', port: s.port || null, actionKey: '', startedAt: '', endedAt: null })), currentNodeId: null, status: 'completed' }) : null), [testResult]);

  const viewNodes = useMemo(() => nodes.map((n) => {
    const s = testStates?.get(n.id);
    return {
      ...n,
      data: {
        ...n.data, readOnly,
        summary: summarizeNode(n.type || '', n.data.config, t, lookups),
        issues: issues.get(n.id)?.length || 0, warnings: warns.get(n.id)?.length || 0,
        runtime: testStates ? (s?.state || 'pending') : undefined, takenPorts: testStates ? (s?.ports || []) : undefined,
        aiFlash: aiFlash.has(n.id),
      },
    };
  }), [nodes, testStates, readOnly, t, lookups, issues, warns, aiFlash]);
  const connectedPorts = useCallback((nodeId: string) => new Set(edges.filter((e) => e.source === nodeId).map((e) => e.sourceHandle || 'out')), [edges]);
  const outputsOf = useCallback((nodeId: string) => outputs[flow.getNode(nodeId)?.type || ''] || [], [outputs, flow]);
  const viewEdges = useMemo(() => {
    const taken = new Set(testResult?.steps.filter((s) => s.port).map((s) => `${s.nodeId}:${s.port}`) || []);
    return edges.map((e) => ({ ...e, data: { ...e.data!, onDelete: readOnly ? undefined : deleteEdge, active: testResult ? taken.has(`${e.source}:${e.sourceHandle}`) : false, dimmed: testResult ? !taken.has(`${e.source}:${e.sourceHandle}`) : false } }));
  }, [edges, readOnly, deleteEdge, testResult]);

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) || null : null;
  const nodeOptions = useMemo(() => nodes.map((n) => ({ id: n.id, label: n.data.label || t(`workflow.node.${n.type}.label`, n.type || '') })), [nodes, t]);
  const nodeLabel = useCallback((id?: string | null) => nodeOptions.find((n) => n.id === id)?.label || id || '', [nodeOptions]);
  const hasTrigger = nodes.some((n) => String(n.type).startsWith('trigger.'));
  const focusNode = useCallback((id: string) => {
    const n = flow.getNode(id); if (!n) return;
    setSelectedId(id);
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === id })));
    flow.setCenter(n.position.x + HALF, n.position.y + 70, { zoom: 1, duration: 400 });
  }, [flow, setNodes]);

  // ----------------------------------------------------------------- render
  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-3"><p className="text-sm text-muted-foreground">{t('workflowBuilder.loadError', 'This workflow could not be loaded.')}</p>
          <Button variant="outline" onClick={() => refetch()}>{t('workflowBuilder.retry', 'Try again')}</Button></div>
      </div>
    );
  }
  if (isLoading || !wf || !catalog) {
    return (
      <div className="flex h-full flex-col">
        <Skeleton className="h-14 w-full rounded-none" />
        <div className="flex flex-1 gap-0"><Skeleton className="hidden w-72 rounded-none lg:block" /><div className="flex-1 bg-muted/20" /><Skeleton className="hidden w-[360px] rounded-none xl:block" /></div>
      </div>
    );
  }

  const palette = (
    <NodePalette nodes={catalog.nodes} hasTrigger={hasTrigger} onAdd={(type) => addNode(type, undefined, selectedId)}
      recent={prefs.recent} favorites={prefs.favorites}
      onToggleFavorite={(type) => setPrefs((p) => ({ ...p, favorites: p.favorites.includes(type) ? p.favorites.filter((x) => x !== type) : [...p.favorites, type].slice(0, 12) }))} />
  );
  const configPanel = (
    <ConfigPanel workflowId={workflowId} node={selectedNode} catalog={catalog} validation={validation} nodeOptions={nodeOptions} readOnly={readOnly}
      meta={meta} onMetaChange={(patch) => setMeta((m) => ({ ...m, ...patch }))} onNodeChange={updateNode}
      onDelete={(id) => deleteNodes([id])} onDuplicate={duplicateNode} onClose={() => setSelectedId(null)} onFocusNode={focusNode}
      onFix={applyFix} connectedPorts={connectedPorts} onTestNode={(id) => { setTestNodeId(id); setDialog('test'); }} onAiHelp={askAiAbout} />
  );
  const copilotPanel = (
    <CopilotPanel workflowId={workflowId} readOnly={readOnly} getGraph={snapshot} selectedNodeId={selectedId} agents={agents} helpRequest={helpRequest}
      onTurnStart={onTurnStart} onGraph={applyCopilotGraph} onRename={(name) => setMeta((m) => ({ ...m, name }))} onUndoTurn={onUndoTurn}
      reviewMode={Boolean(prefs.copilotReview)} onToggleReview={() => setPrefs((p) => ({ ...p, copilotReview: !p.copilotReview }))}
      onTurnEnd={() => { copilotBusy.current = false; requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 500, maxZoom: 1 })); }}
      onClose={() => setRightPanel('config')} />
  );
  const validationPanel = (
    <ValidationPanel validation={validation} nodeLabel={nodeLabel} outputsOf={outputsOf} connectedPorts={connectedPorts} readOnly={readOnly}
      onFocus={(id) => { focusNode(id); setRightPanel('config'); }} onFix={applyFix} onClose={() => setRightPanel('config')} />
  );
  const issueCount = (validation?.errors.length || 0) + (validation?.warnings.filter((w) => w.severity !== 'info' && w.code !== 'branch_unconnected' && w.code !== 'loop_present').length || 0);
  const rightTabs = (
    <div className="flex shrink-0 gap-1 border-b bg-card/80 p-1.5" role="tablist" aria-label={t('workflowBuilder.panel.aria', 'Configuration')}>
      {([['config', Settings2, t('workflowBuilder.tabs.settings', 'Settings')], ['copilot', Sparkles, t('workflowBuilder.tabs.copilot', 'AI Copilot')], ['validation', ListChecks, t('workflowBuilder.tabs.check', 'Check')]] as const).map(([key, Icon, label]) => (
        <button key={key} type="button" role="tab" aria-selected={rightPanel === key} onClick={() => setRightPanel(key)}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
            rightPanel === key ? (key === 'copilot' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300' : 'bg-muted text-foreground') : 'text-muted-foreground hover:bg-muted/60')}>
          <Icon className="size-3.5" />{label}
          {key === 'validation' && issueCount > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-bold', validation?.errors.length ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white')}>{issueCount}</span>}
        </button>
      ))}
    </div>
  );
  const rightContent = rightPanel === 'copilot' ? copilotPanel : rightPanel === 'validation' ? validationPanel : configPanel;
  const panel = configPanel;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <BuilderToolbar
        workflowId={workflowId} name={meta.name} onNameChange={(name) => setMeta((m) => ({ ...m, name }))} status={wf.status} publishedVersion={wf.publishedVersion}
        dirty={dirty} saving={mutations.save.isPending} savedAt={savedAt} readOnly={readOnly} canPublish={canPublish}
        canUndo={hist.past > 0} canRedo={hist.future > 0} errorCount={validation?.errors.length || 0}
        onSave={() => void save()} onUndo={undo} onRedo={redo}
        onZoomIn={() => flow.zoomIn({ duration: 200 })} onZoomOut={() => flow.zoomOut({ duration: 200 })} onFit={() => flow.fitView({ padding: 0.2, duration: 300 })}
        onLayout={layout} onTest={() => setDialog('test')} onPublish={openPublish} onVersions={() => setDialog('versions')}
        onDuplicate={async () => { try { const copy = await mutations.duplicate.mutateAsync(workflowId); router.push(`/automation/workflows/${copy._id}`); } catch { /* toast shown */ } }}
        onStatus={(status) => mutations.setStatus.mutate({ id: workflowId, status }, { onSuccess: () => { void refetch(); if (status === 'archived') router.push('/automation/workflows'); } })}
        onTogglePalette={() => setPaletteOpen(true)}
        onCopilot={() => setRightPanel((p) => (p === 'copilot' ? 'config' : 'copilot'))} copilotOpen={rightPanel === 'copilot'}
        onValidate={() => setRightPanel('validation')} issueCount={issueCount}
        minimap={prefs.minimap} onToggleMinimap={() => setPrefs((p) => ({ ...p, minimap: !p.minimap }))}
        autosave={prefs.autosave} onToggleAutosave={() => setPrefs((p) => ({ ...p, autosave: !p.autosave }))}
      />
      {readOnly && (
        <div className="border-b bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-800 dark:text-amber-200">
          {wf.status === 'archived' ? t('workflowBuilder.readOnlyArchived', 'This workflow is archived and read-only. Duplicate it to make changes.') : t('workflowBuilder.readOnly', 'You can view this workflow but not edit it.')}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!readOnly && <div className="hidden w-72 shrink-0 border-e bg-card/60 lg:block">{palette}</div>}
        <div ref={wrapper} className="wf-canvas relative min-w-0 flex-1" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          <ReactFlow<CanvasNode, CanvasEdge>
            nodes={viewNodes} edges={viewEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
            onNodeDragStart={() => pushHistory()}
            onSelectionChange={({ nodes: sel }) => setSelectedId(sel.length === 1 ? sel[0].id : null)}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => { setSelectedId(null); if (testResult) setTestResult(null); }}
            colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
            snapToGrid snapGrid={[16, 16]} minZoom={0.15} maxZoom={1.75}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']} multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            selectionOnDrag={false} selectionKeyCode="Shift" selectionMode={SelectionMode.Partial} panOnScroll
            nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable
            defaultEdgeOptions={{ type: EDGE_TYPE }} connectionRadius={28}
            proOptions={{ hideAttribution: true }}
            aria-label={t('workflowBuilder.canvas', 'Workflow canvas')}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} className="!text-slate-300 dark:!text-slate-700" color="currentColor" />
            <Controls showInteractive={false} position="bottom-left" className="!hidden sm:!flex" />
            {prefs.minimap && <MiniMap pannable zoomable position="bottom-right" className="!hidden md:!block" nodeColor={(n) => CATEGORY_STYLES[visualFor(n.type || '').category].minimap} nodeBorderRadius={8} maskColor="rgb(15 23 42 / 0.07)" />}
          </ReactFlow>

          {testResult && (
            <div className="pointer-events-auto absolute start-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur rtl:translate-x-1/2">
              <span className="size-2 animate-pulse rounded-full bg-sky-500" />
              {t('workflowBuilder.test.overlay', 'Showing test path for {lead}', { lead: testResult.lead.name })}
              <button type="button" onClick={() => setTestResult(null)} className="rounded-full p-0.5 hover:bg-muted" aria-label={t('workflowBuilder.test.clear', 'Clear test path')}><X className="size-3.5" /></button>
            </div>
          )}

          {nodes.length === 0 && !readOnly && <EmptyCanvas onAdd={(type) => addNode(type)} onAi={() => setRightPanel('copilot')} />}
        </div>
        <aside className={cn('relative hidden shrink-0 flex-col border-s bg-card/60 xl:flex', !prefs.panelWidth && (rightPanel === 'copilot' ? 'w-[420px]' : 'w-[380px]'))}
          style={prefs.panelWidth ? { width: prefs.panelWidth } : undefined} aria-label={t('workflowBuilder.panel.aria', 'Configuration')}>
          <PanelResizer width={prefs.panelWidth || (rightPanel === 'copilot' ? 420 : 380)} onResize={(w) => setPrefs((p) => ({ ...p, panelWidth: w === null ? null : clampWidth(w) }))} />
          {rightTabs}
          <div className="min-h-0 flex-1">{rightContent}</div>
        </aside>
      </div>

      <Sheet open={paletteOpen && !large} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="w-80 p-0"><SheetTitle className="sr-only">{t('workflowBuilder.palette.title', 'Building blocks')}</SheetTitle>{palette}</SheetContent>
      </Sheet>
      <Sheet open={!wide && (rightPanel !== 'config' || Boolean(selectedNode))} onOpenChange={(v: boolean) => { if (!v) { setSelectedId(null); setRightPanel('config'); } }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md xl:hidden"><SheetTitle className="sr-only">{t('workflowBuilder.panel.aria', 'Configuration')}</SheetTitle>{rightTabs}<div className="min-h-0 flex-1">{rightPanel === 'config' ? panel : rightContent}</div></SheetContent>
      </Sheet>

      <TestRunDialog open={dialog === 'test'} onOpenChange={(v) => { setDialog(v ? 'test' : null); if (!v) setTestNodeId(null); }} workflowId={workflowId} graph={graph}
        onResult={(r) => { setTestResult(r); if (r) setDialog(null); }} startNodeId={testNodeId}
        canLiveTest={hasPermission('workflow:execute') && wf.status === 'published'} publishedVersion={wf.publishedVersion} dirty={dirty} />
      <PublishDialog open={dialog === 'publish'} onOpenChange={(v) => setDialog(v ? 'publish' : null)} validation={validation} nextVersion={(wf.latestVersion || 0) + 1}
        publishing={mutations.publish.isPending || mutations.save.isPending} dirty={dirty} onPublish={publish} nodeLabel={nodeLabel} />
      <VersionsSheet open={dialog === 'versions'} onOpenChange={(v) => setDialog(v ? 'versions' : null)} workflowId={workflowId} publishedVersion={wf.publishedVersion} canPublish={canPublish}
        onRolledBack={() => { setLoadedFor(null); void refetch(); setDialog(null); }} />
    </div>
  );
}

const STARTERS = ['trigger.manual', 'trigger.lead_created', 'trigger.call_completed', 'trigger.inbound_call', 'trigger.message_received', 'trigger.webhook'];

function EmptyCanvas({ onAdd, onAi }: { onAdd: (type: string) => void; onAi: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="pointer-events-auto w-full max-w-xl rounded-3xl border bg-card/95 p-6 text-center shadow-xl backdrop-blur">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="size-6" /></span>
        <h2 className="mt-3 text-lg font-semibold">{t('workflowBuilder.empty.title', 'Start with a trigger')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('workflowBuilder.empty.text', 'Choose what starts this workflow. Then add AI calls, messages, conditions and CRM updates from the left.')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STARTERS.map((type) => {
            const v = visualFor(type); const Icon = v.icon;
            return (
              <button key={type} type="button" onClick={() => onAdd(type)} className="flex items-center gap-2 rounded-xl border p-2.5 text-start text-xs font-medium transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm">
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', CATEGORY_STYLES[v.category].icon)}><Icon className="size-4" /></span>
                <span className="line-clamp-2">{t(`workflow.node.${type}.label`, type)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={onAi} className="border-0 bg-gradient-to-r from-sky-600 to-cyan-500 text-white hover:from-sky-700 hover:to-cyan-600"><Sparkles className="me-1.5 size-4" />{t('workflowBuilder.empty.ai', 'Describe it — build with AI')}</Button>
          <Button asChild variant="link"><Link href="/automation/templates"><LayoutTemplate className="me-1.5 size-4" />{t('workflowBuilder.empty.templates', 'Or start from a template')}</Link></Button>
        </div>
      </div>
    </div>
  );
}

