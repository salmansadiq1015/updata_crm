// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Workflow Builder 2.0 client: SSE parsing of copilot streams, the copilot panel (live graph
 * application, progress, questions with real agents, markdown, per-turn undo) and the
 * validation panel (severity grouping, fixes, quick actions).
 */
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : `{${n}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
const auth = vi.hoisted(() => ({ token: 'tok-1' }));
const refresh = vi.hoisted(() => vi.fn(async () => { auth.token = 'tok-2'; return { accessToken: 'tok-2' }; }));
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ accessToken: auth.token }) } }));
vi.mock('@/modules/auth/services/session-refresh-service', () => ({ refreshSession: refresh }));
vi.mock('@/lib/api/config', () => ({ API_URL: 'http://api.test/api/v1' }));

const { streamCopilot, CopilotStreamError } = await import('../services/copilot-stream');
const { timelineReduce, startTimeline } = await import('../ui/builder/copilot-timeline');
const { CopilotPanel } = await import('../ui/builder/copilot-panel');
const { ValidationPanel, fixesFor } = await import('../ui/builder/validation-panel');
const { PanelResizer, PANEL_MIN, PANEL_MAX } = await import('../ui/builder/panel-resizer');

const encoder = new TextEncoder();
function sseResponse(events: object[], { split = true } = {}) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(': ping\n\n');
  const chunks = split ? [text.slice(0, 17), text.slice(17, 60), text.slice(60)] : [text];
  return new Response(new ReadableStream({ start(c) { for (const ch of chunks) c.enqueue(encoder.encode(ch)); c.close(); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}
const g = (n: number) => ({ nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, type: i ? 'end' : 'trigger.manual', position: { x: 0, y: i * 100 }, data: { label: '', config: {} } })), edges: [] });

beforeEach(() => { sessionStorage.clear(); auth.token = 'tok-1'; refresh.mockClear(); });

describe('copilot stream', () => {
  it('parses SSE frames split across chunks, ignores pings, sends the bearer token', async () => {
    const fetchMock = vi.fn(async () => sseResponse([{ type: 'status', key: 'understanding' }, { type: 'op', name: 'add_node', step: 'Adding', change: { kind: 'add_node', nodeId: 'n0' }, graph: g(1) }, { type: 'done', graph: g(1), name: 'x', changed: true, opsApplied: 1, validation: { valid: true, errors: [], warnings: [] } }]));
    vi.stubGlobal('fetch', fetchMock);
    const got: string[] = [];
    await streamCopilot('wf1', { messages: [{ role: 'user', content: 'hi' }], graph: g(0), locale: 'en' }, (e) => got.push(e.type), new AbortController().signal);
    expect(got).toEqual(['status', 'op', 'done']);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/workflows/wf1/copilot');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('refreshes the session once on 401 and surfaces API errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(sseResponse([{ type: 'message', text: 'ok' }, { type: 'done', graph: g(0), name: 'x', changed: false, opsApplied: 0, validation: { valid: true, errors: [], warnings: [] } }]));
    vi.stubGlobal('fetch', fetchMock);
    const got: string[] = [];
    await streamCopilot('wf1', { messages: [{ role: 'user', content: 'hi' }], graph: g(0), locale: 'en' }, (e) => got.push(e.type), new AbortController().signal);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[1][1] as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok-2');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'AI_NOT_CONFIGURED', message: 'nope' } }), { status: 503 })));
    await expect(streamCopilot('wf1', { messages: [], graph: g(0), locale: 'en' }, () => {}, new AbortController().signal)).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' });
  });
});

describe('copilot stream robustness', () => {
  it('reports a stream that closes without a final event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([{ type: 'status', key: 'understanding' }])));
    await expect(streamCopilot('wf1', { messages: [], graph: g(0), locale: 'en' }, () => {}, new AbortController().signal)).rejects.toMatchObject({ reason: 'ended' });
  });
  it('gives up when nothing (not even a keep-alive) arrives in time', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => new Response(new ReadableStream({
      start(c) { c.enqueue(encoder.encode(': ping\n\n')); init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); },
    }), { status: 200 })));
    const err = await streamCopilot('wf1', { messages: [], graph: g(0), locale: 'en' }, () => {}, new AbortController().signal, { stallMs: 60 }).catch((e) => e);
    expect(err).toBeInstanceOf(CopilotStreamError);
    expect(err.reason).toBe('stalled');
  });
  it('a user stop is not reported as a stall', async () => {
    const ctl = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => new Response(new ReadableStream({
      start(c) { init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); setTimeout(() => ctl.abort(), 10); },
    }), { status: 200 })));
    const err = await streamCopilot('wf1', { messages: [], graph: g(0), locale: 'en' }, () => {}, ctl.signal, { stallMs: 5000 }).catch((e) => e);
    expect(err).not.toBeInstanceOf(CopilotStreamError);
  });
});

describe('copilot timeline', () => {
  const tt = (k: string, f?: string | null, v?: Record<string, unknown>) => (f || k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ''));
  it('reduces a turn into timed entries: understand → resources → thinking (+plan) → tool calls → check', () => {
    let items = startTimeline(0, tt);
    const ev = (e: object, at: number) => { items = timelineReduce(items, e as never, at, tt); };
    ev({ type: 'status', key: 'resources', agents: 3, templates: 5 }, 400);
    ev({ type: 'status', key: 'thinking', round: 1 }, 400);
    ev({ type: 'thought', text: 'I will add a trigger and a call.' }, 1900);
    ev({ type: 'tool_start', callId: 'c1', name: 'add_node', step: 'Adding the trigger' }, 1900);
    ev({ type: 'op', callId: 'c1', name: 'add_node', step: 'Adding the trigger', change: { kind: 'add_node' }, graph: g(1) }, 2100);
    ev({ type: 'tool_start', callId: 'c2', name: 'add_node', step: 'Adding the call' }, 2100);
    ev({ type: 'op_error', callId: 'c2', name: 'add_node', code: 'unknown_agent', message: 'Agent x does not exist' }, 2200);
    ev({ type: 'status', key: 'thinking', round: 2 }, 2200);
    ev({ type: 'tool_start', callId: 'c3', name: 'validate_workflow', step: '' }, 3000);
    ev({ type: 'tool_done', callId: 'c3', name: 'validate_workflow', errors: 0, warnings: 1 }, 3050);
    ev({ type: 'done' }, 3600);
    expect(items.map((i) => [i.kind, i.label, i.state, (i.t1 ?? 0) - i.t0])).toEqual([
      ['understand', 'Understanding your request', 'done', 400],
      ['resources', 'Loaded your agents and templates', 'done', 0],
      ['think', 'Thinking', 'done', 1500],
      ['tool', 'Adding the trigger', 'done', 200],
      ['tool', 'Adding the call', 'warn', 100],
      ['think', 'Thinking about the next step', 'done', 800],
      ['validate', 'validate_workflow', 'done', 50],
    ]);
    expect(items[1].detail).toBe('Agents: 3 · Templates: 5');
    expect(items[2].thought).toBe('I will add a trigger and a call.');
    expect(items[4].detail).toBe('Agent x does not exist');
    expect(items[6].detail).toBe('No blocking problems · Warnings: 1');
  });
  it('the round that produced the reply is shown as writing the answer', () => {
    let items = timelineReduce(startTimeline(0, tt), { type: 'status', key: 'thinking', round: 3 } as never, 100, tt);
    items = timelineReduce(items, { type: 'message', text: 'Done' } as never, 900, tt);
    expect(items.at(-1)).toMatchObject({ kind: 'answer', label: 'Writing the answer', state: 'done', t1: 900 });
  });
  it('an error stops whatever is running', () => {
    const items = timelineReduce(startTimeline(0, tt), { type: 'error', message: 'x' }, 50, tt);
    expect(items[0]).toMatchObject({ state: 'stopped', t1: 50 });
  });
});

describe('copilot panel', () => {
  const baseProps = () => ({
    workflowId: 'wf1', readOnly: false, getGraph: () => g(0), selectedNodeId: null, helpRequest: null,
    agents: [{ _id: 'a1', name: 'Aria Customer Support', availability: 'active', agentConfig: { language: 'en' } }],
    onTurnStart: vi.fn(), onGraph: vi.fn(), onRename: vi.fn(), onUndoTurn: vi.fn(() => true), onTurnEnd: vi.fn(), onClose: vi.fn(),
  });

  it('applies every operation to the canvas live, shows progress, markdown and an undo for the turn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      { type: 'status', key: 'resources' },
      { type: 'op', name: 'add_node', step: 'Adding the trigger', change: { kind: 'add_node', nodeId: 'n0' }, graph: g(1) },
      { type: 'op_error', name: 'add_node', code: 'unknown_agent', message: 'Agent x does not exist' },
      { type: 'op', name: 'add_node', step: 'Adding the AI call', change: { kind: 'add_node', nodeId: 'n1' }, graph: g(2) },
      { type: 'rename', name: 'Lead qualification' },
      { type: 'message', text: 'Built **2 steps**:\n1. Trigger\n2. Call' },
      { type: 'done', graph: g(2), name: 'Lead qualification', changed: true, opsApplied: 2, validation: { valid: true, errors: [], warnings: [] } },
    ])));
    const props = baseProps();
    render(<CopilotPanel {...props} />);
    fireEvent.click(screen.getByText('Create an AI lead qualification workflow for new leads'));
    await waitFor(() => expect(screen.getByText('2 change(s) applied to the canvas')).toBeInTheDocument());
    expect(props.onTurnStart).toHaveBeenCalledTimes(1);
    expect(props.onGraph.mock.calls.map((c) => [c[0].nodes.length, c[1]])).toEqual([[1, 'n0'], [2, 'n1']]);
    expect(props.onRename).toHaveBeenCalledWith('Lead qualification');
    expect(screen.getByText('Adding the trigger')).toBeInTheDocument();
    expect(screen.getByText('Adjusting a step')).toBeInTheDocument();
    expect(screen.getByText('2 steps').tagName).toBe('STRONG');
    expect(screen.getByRole('list', { name: 'What the AI did' })).toBeInTheDocument();
    expect(screen.getByText(/^Worked for /)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').some((li) => li.textContent === 'Call')).toBe(true);
    expect(props.onTurnEnd).toHaveBeenCalled();
    const turnId = props.onTurnStart.mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', { name: /Undo these changes/ }));
    expect(props.onUndoTurn).toHaveBeenCalledWith(turnId);
    expect(screen.getByText(/These changes were undone/)).toBeInTheDocument();
  });

  it('shows questions with real agent details and sends the chosen option as the next message', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([{ type: 'question', question: 'Which AI agent should call?', kind: 'agent', options: [{ label: 'Aria Customer Support', value: 'a1' }], allowFreeText: true }, { type: 'done', graph: g(0), name: 'x', changed: false, opsApplied: 0, validation: { valid: false, errors: [], warnings: [] }, awaitingAnswer: true }]))
      .mockResolvedValueOnce(sseResponse([{ type: 'message', text: 'Done' }, { type: 'done', graph: g(0), name: 'x', changed: false, opsApplied: 0, validation: { valid: true, errors: [], warnings: [] } }]));
    vi.stubGlobal('fetch', fetchMock);
    render(<CopilotPanel {...baseProps()} />);
    fireEvent.change(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ }), { target: { value: 'Create an AI calling workflow' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ }), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Which AI agent should call?')).toBeInTheDocument());
    expect(screen.getByText('EN · active')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Aria Customer Support/ })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(body.messages[1].content).toContain('Which AI agent should call?');
    expect(body.messages[2].content).toBe('Aria Customer Support (id a1)');
  });
});

describe('copilot panel 2.1 — direct apply, review mode', () => {
  const props = () => ({
    workflowId: 'wf2', readOnly: false, getGraph: () => g(0), selectedNodeId: null, helpRequest: null, agents: [],
    onTurnStart: vi.fn(), onGraph: vi.fn(), onRename: vi.fn(), onUndoTurn: vi.fn(() => true), onTurnEnd: vi.fn(), onClose: vi.fn(),
  });

  it('sends the option\'s settings change as `apply` so the server applies it directly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse([{ type: 'question', question: 'Retry how often?', kind: 'choice', options: [{ label: '3 attempts', value: '3', apply: { node: 'call', config: { maxAttempts: 3 } } }, { label: 'Other', value: 'x' }], allowFreeText: true }, { type: 'done', graph: g(0), name: 'x', changed: false, opsApplied: 0, validation: { valid: true, errors: [], warnings: [] }, awaitingAnswer: true }]))
      .mockResolvedValueOnce(sseResponse([{ type: 'op', name: 'update_node', step: '', change: { kind: 'update_node', nodeId: 'call', direct: true }, graph: g(2) }, { type: 'done', graph: g(2), name: 'x', changed: true, opsApplied: 1, validation: { valid: true, errors: [], warnings: [] } }]));
    vi.stubGlobal('fetch', fetchMock);
    const p = props();
    render(<CopilotPanel {...p} />);
    fireEvent.click(screen.getByText('Check this workflow for problems and fix them'));
    await waitFor(() => expect(screen.getByText('Retry how often?')).toBeInTheDocument());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /3 attempts/ })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).apply).toEqual({ node: 'call', config: { maxAttempts: 3 } });
    await waitFor(() => expect(screen.getByText('Applied your choice')).toBeInTheDocument());
    expect(p.onGraph).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Array) }), 'call');
  });

  it('review mode stages changes; nothing reaches the canvas until Apply; Discard keeps the canvas', async () => {
    const turn = () => sseResponse([
      { type: 'op', name: 'add_node', step: 'Adding the trigger', change: { kind: 'add_node', nodeId: 'n0' }, graph: g(1) },
      { type: 'op', name: 'add_node', step: 'Adding the end', change: { kind: 'add_node', nodeId: 'n1' }, graph: g(2) },
      { type: 'rename', name: 'Proposed name' },
      { type: 'message', text: 'Here is my proposal.' },
      { type: 'done', graph: g(2), name: 'Proposed name', changed: true, opsApplied: 2, validation: { valid: true, errors: [], warnings: [] } },
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => turn()));
    const p = props();
    const onToggleReview = vi.fn();
    render(<CopilotPanel {...p} reviewMode onToggleReview={onToggleReview} />);
    expect(screen.getByRole('button', { name: 'Review changes before applying' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('Check this workflow for problems and fix them'));
    await waitFor(() => expect(screen.getByText('2 change(s) proposed — not applied yet')).toBeInTheDocument());
    expect(p.onGraph).not.toHaveBeenCalled();
    expect(p.onRename).not.toHaveBeenCalled();
    expect(screen.getByText('New name: Proposed name')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ })).toBeDisabled();
    expect(screen.getByText('Apply or discard the proposed changes first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Apply to canvas/ }));
    expect(p.onTurnStart).toHaveBeenCalledTimes(1); // snapshot for undo
    expect(p.onGraph).toHaveBeenCalledWith(expect.objectContaining({ nodes: expect.any(Array) }), null);
    expect(p.onGraph.mock.calls[0][0].nodes).toHaveLength(2);
    expect(p.onRename).toHaveBeenCalledWith('Proposed name');
    expect(screen.getByText('2 change(s) applied to the canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo these changes/ })).toBeInTheDocument();

    // Second turn → discard
    fireEvent.change(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ }), { target: { value: 'again' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ }), { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(p.onGraph).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Proposed changes discarded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review changes before applying' }));
    expect(onToggleReview).toHaveBeenCalled();
  });
});

describe('panel resizer', () => {
  it('resizes with the keyboard within bounds and resets on double-click', () => {
    const onResize = vi.fn();
    const { rerender } = render(<PanelResizer width={400} onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Resize panel' });
    expect(sep).toHaveAttribute('aria-valuenow', '400');
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(416);
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(384);
    fireEvent.keyDown(sep, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(PANEL_MAX);
    rerender(<PanelResizer width={PANEL_MIN} onResize={onResize} />);
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(PANEL_MIN);
    fireEvent.doubleClick(sep);
    expect(onResize).toHaveBeenLastCalledWith(null);
  });
  it('drags: moving the pointer towards the canvas widens the panel', () => {
    // jsdom has no PointerEvent (fireEvent would drop clientX) → use MouseEvent semantics.
    if (!('PointerEvent' in window) || !new window.PointerEvent('pointermove', { clientX: 1 }).clientX) {
      class PE extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; } }
      vi.stubGlobal('PointerEvent', PE);
    }
    const onResize = vi.fn();
    render(<PanelResizer width={400} onResize={onResize} />);
    const sep = screen.getByRole('separator');
    fireEvent.pointerDown(sep, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(sep, { clientX: 900, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(500);
    fireEvent.pointerMove(sep, { clientX: 100, pointerId: 1 });
    expect(onResize).toHaveBeenLastCalledWith(PANEL_MAX);
    fireEvent.pointerUp(sep, { pointerId: 1 });
    onResize.mockClear();
    fireEvent.pointerMove(sep, { clientX: 0, pointerId: 1 });
    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('validation panel', () => {
  const validation = {
    valid: false,
    errors: [{ nodeId: 'c', field: 'agentId', code: 'required' }],
    warnings: [{ nodeId: 'n', code: 'node_dead_end' }, { nodeId: 'c', code: 'branch_unconnected', ports: ['failed', 'blocked'], severity: 'info' as const }],
  };
  it('groups by severity, explains fixes and offers quick actions', () => {
    const onFix = vi.fn(); const onFocus = vi.fn();
    render(<ValidationPanel validation={validation} nodeLabel={(id) => ({ c: 'AI call', n: 'Note' }[id || ''] || '')} outputsOf={(id) => (id === 'n' ? ['out'] : ['answered', 'unanswered', 'failed', 'blocked'])}
      connectedPorts={() => new Set(['answered'])} onFocus={onFocus} onFix={onFix} onClose={vi.fn()} readOnly={false} />);
    expect(screen.getByText('1 errors')).toBeInTheDocument();
    expect(screen.getByText('1 warnings')).toBeInTheDocument();
    expect(screen.getByText('1 suggestions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mark as intentional end/ }));
    expect(onFix).toHaveBeenCalledWith({ kind: 'intentional_end', nodeId: 'n' });
    fireEvent.click(screen.getAllByRole('button', { name: /Add End step on/ })[0]);
    expect(onFix).toHaveBeenCalledWith(expect.objectContaining({ kind: 'add_end' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Go to step/ })[0]);
    expect(onFocus).toHaveBeenCalledWith('c');
  });
  it('quick fixes are derived from the issue', () => {
    expect(fixesFor({ code: 'condition_branch_missing', nodeId: 'q' }, () => ['yes', 'no'])).toEqual([{ kind: 'add_end', nodeId: 'q', port: 'yes' }, { kind: 'add_end', nodeId: 'q', port: 'no' }]);
    expect(fixesFor({ code: 'trigger_missing' }, () => [])).toEqual([{ kind: 'add_trigger' }]);
    expect(fixesFor({ code: 'required', nodeId: 'x' }, () => [])).toEqual([]);
  });
});
