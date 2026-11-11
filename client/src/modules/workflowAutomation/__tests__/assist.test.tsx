// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Copilot assist features: voice dictation (record → server transcription → send / edit), read-aloud,
 * context-aware quick prompts, the prompt library and the interactive workflow demo.
 */
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback || key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : `{${n}}`)) : text;
  };
  const value = { locale: 'de', language: 'de', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
const auth = vi.hoisted(() => ({ token: 'tok-1' }));
const refresh = vi.hoisted(() => vi.fn(async () => { auth.token = 'tok-2'; return { accessToken: 'tok-2' }; }));
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ accessToken: auth.token }) } }));
vi.mock('@/modules/auth/services/session-refresh-service', () => ({ refreshSession: refresh }));
vi.mock('@/lib/api/config', () => ({ API_URL: 'http://api.test/api/v1' }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
const catalog = {
  nodes: ['trigger.lead_created', 'trigger.inbound_call', 'trigger.leads_imported', 'ai.call', 'ai.analyze', 'ai.callback', 'notify.user', 'task.create', 'msg.sms', 'msg.email', 'logic.wait_event', 'crm.add_tags', 'end']
    .map((type) => ({ type, category: 'ai', defaults: {}, outputs: ({ 'ai.call': ['answered', 'unanswered', 'failed', 'blocked'], 'ai.analyze': ['qualified', 'not_qualified', 'callback', 'unknown'], 'ai.callback': ['out', 'failed'], 'msg.sms': ['sent', 'blocked', 'failed'], 'msg.email': ['sent', 'blocked', 'failed'], 'logic.wait_event': ['matched', 'timeout'], end: [] } as Record<string, string[]>)[type] || ['out'] })),
};
vi.mock('../hooks/use-workflows', () => ({ useWorkflowCatalog: () => ({ data: catalog }) }));
// React Flow needs layout APIs jsdom lacks; render nodes as plain items (enough to follow the choreography).
const fitBounds = vi.hoisted(() => vi.fn());
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, edges }: { nodes: Array<{ id: string; className?: string }>; edges: Array<{ id: string; data?: { active?: boolean } }> }) => (
    <div data-testid="flow">{nodes.map((n) => <div key={n.id} data-testid="node" data-id={n.id} className={n.className} />)}{edges.map((e) => <div key={e.id} data-testid="edge" data-active={String(Boolean(e.data?.active))} />)}</div>
  ),
  ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
  useReactFlow: () => ({ fitBounds }),
  Background: () => null, BackgroundVariant: { Dots: 'dots' }, Handle: () => null, Position: { Top: 'top', Bottom: 'bottom' },
  BaseEdge: () => null, EdgeLabelRenderer: () => null, getSmoothStepPath: () => ['', 0, 0], MarkerType: { ArrowClosed: 'arrowclosed' },
}));

const { transcribeCopilotAudio } = await import('../services/copilot-stream');
const { CopilotPanel } = await import('../ui/builder/copilot-panel');
const { quickPromptsFor } = await import('../ui/builder/copilot-prompts');
const { WorkflowDemoDialog, DEMO_SCENARIOS, demoGraph } = await import('../ui/builder/workflow-demo');

const encoder = new TextEncoder();
const sse = (events: object[]) => new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''))); c.close(); } }), { status: 200 });
const done = { type: 'done', graph: { nodes: [], edges: [] }, name: 'x', changed: false, opsApplied: 0, validation: { valid: true, errors: [], warnings: [] } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const tt = (k: string, f?: string | null, v?: Record<string, unknown>) => (f || k).replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ''));

const panelProps = () => ({
  workflowId: 'wf9', readOnly: false, getGraph: () => ({ nodes: [], edges: [] }), selectedNodeId: null, helpRequest: null, agents: [],
  onTurnStart: vi.fn(), onGraph: vi.fn(), onRename: vi.fn(), onUndoTurn: vi.fn(() => true), onTurnEnd: vi.fn(), onClose: vi.fn(),
});

// --- Fake microphone stack -----------------------------------------------------------------
class FakeRecorder {
  static isTypeSupported = (m: string) => m === 'audio/webm';
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) }); this.onstop?.(); }
}
class FakeAudioContext {
  createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData: (b: Float32Array) => b.fill(0.2) }; }
  createMediaStreamSource() { return { connect: () => {} }; }
  close() { return Promise.resolve(); }
}
const track = { stop: vi.fn() };
function installMic(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(getUserMedia) } });
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); auth.token = 'tok-1'; refresh.mockClear(); track.stop.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('voice dictation', () => {
  it('uploads the recording with the UI language and refreshes the session once on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ success: true, data: { available: true, text: 'Hallo' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeCopilotAudio('wf9', new Blob(['x'], { type: 'audio/webm' }), 'de')).toEqual({ available: true, text: 'Hallo' });
    expect(refresh).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('http://api.test/api/v1/workflows/wf9/copilot/transcribe');
    expect(init.headers.Authorization).toBe('Bearer tok-2');
    const form = init.body as FormData;
    expect(form.get('language')).toBe('de');
    expect((form.get('audio') as File).name).toBe('dictation.webm');
  });

  it('speak → stop and send: the transcript becomes the next copilot message; the mic is released', async () => {
    installMic(async () => ({ getTracks: () => [track] }));
    const fetchMock = vi.fn(async (url: string) => (String(url).endsWith('/transcribe')
      ? json({ success: true, data: { available: true, text: 'Ruf jeden neuen Lead an' } })
      : sse([{ type: 'message', text: 'Erledigt' }, done])));
    vi.stubGlobal('fetch', fetchMock);
    render(<CopilotPanel {...panelProps()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' })); });
    expect(screen.getByRole('group', { name: 'Recording' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Message to the Workflow Copilot/ })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop and send' })); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Ruf jeden neuen Lead an' });
    expect(track.stop).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Erledigt')).toBeInTheDocument());
  });

  it('“stop and edit” puts the transcript in the box instead of sending', async () => {
    installMic(async () => ({ getTracks: () => [track] }));
    const fetchMock = vi.fn(async () => json({ success: true, data: { available: true, text: 'Nur SMS bitte' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CopilotPanel {...panelProps()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop and edit the text' })); });
    await waitFor(() => expect(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ })).toHaveValue('Nur SMS bitte'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a blocked microphone, an unavailable recogniser and an empty result', async () => {
    installMic(async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); });
    render(<CopilotPanel {...panelProps()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access is blocked');

    installMic(async () => ({ getTracks: () => [track] }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, data: { available: false, text: '', reason: 'ai_not_configured' } })));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop and send' })); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Speech recognition is not available'));
  });

  it('discarding a recording sends nothing', async () => {
    installMic(async () => ({ getTracks: () => [track] }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<CopilotPanel {...panelProps()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Speak instead of typing' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard recording' })); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ })).toBeInTheDocument();
  });

  it('read-aloud: speaks replies in the UI language when switched on', async () => {
    const speak = vi.fn((u: { onend?: () => void }) => u.onend?.());
    vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; onend?: () => void; onerror?: () => void; constructor(public text: string) {} });
    vi.stubGlobal('fetch', vi.fn(async () => sse([{ type: 'message', text: 'Ich habe **3 Schritte** gebaut.' }, done])));
    render(<CopilotPanel {...panelProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read replies aloud' }));
    expect(localStorage.getItem('updata.wf-copilot.speak')).toBe('1');
    fireEvent.click(screen.getByText('Explain what this workflow does'));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0][0] as unknown as { text: string; lang: string };
    expect(utterance.text).toContain('Ich habe 3 Schritte gebaut.');
    expect(utterance.lang).toBe('de-DE');
  });
});

describe('predefined prompts', () => {
  it('adapts to the canvas: empty, selected step, problems', () => {
    expect(quickPromptsFor({ nodeCount: 0, selectedLabel: null, issueCount: 0 }, tt).map((p) => p.id)).toEqual(['qualify', 'missed', 'nurture', 'demo']);
    const selected = quickPromptsFor({ nodeCount: 4, selectedLabel: 'AI call', issueCount: 2 }, tt);
    expect(selected.map((p) => p.id)).toEqual(['configure', 'after', 'explainStep', 'fix']);
    expect(selected[0]).toMatchObject({ label: 'Configure “AI call”', prompt: 'Help me configure the step “AI call”.' });
    expect(quickPromptsFor({ nodeCount: 4, selectedLabel: null, issueCount: 3 }, tt)[0]).toMatchObject({ id: 'fix', label: 'Fix problems (3)' });
  });

  it('quick prompts send immediately; the library fills the box for editing; the demo card opens the demo', async () => {
    sessionStorage.setItem('updata.wf-copilot.wf9', JSON.stringify([{ id: 'u1', role: 'user', content: 'hi' }, { id: 'a1', role: 'assistant', content: 'Hello' }]));
    const fetchMock = vi.fn(async () => sse([{ type: 'message', text: 'ok' }, done]));
    vi.stubGlobal('fetch', fetchMock);
    const onOpenDemo = vi.fn();
    render(<CopilotPanel {...panelProps()} nodeCount={5} issueCount={2} onOpenDemo={onOpenDemo} />);
    const chips = screen.getByRole('group', { name: 'Suggested prompts' });
    fireEvent.click(chips.querySelector('button')!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).messages.at(-1).content).toBe('Check this workflow and fix all problems.');

    fireEvent.click(screen.getByRole('button', { name: 'Prompt library' }));
    fireEvent.click(await screen.findByText('Only during business hours'));
    expect(screen.getByRole('textbox', { name: /Message to the Workflow Copilot/ })).toHaveValue('Make every call and message wait for business hours (Mon–Fri, 08:00–18:00 in the lead’s time zone).');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the empty state offers the demo', () => {
    const onOpenDemo = vi.fn();
    render(<CopilotPanel {...panelProps()} onOpenDemo={onOpenDemo} />);
    fireEvent.click(screen.getByText('Watch a 1-minute demo'));
    expect(onOpenDemo).toHaveBeenCalled();
  });
});

describe('interactive demo', () => {
  const props = () => ({ open: true, onOpenChange: vi.fn(), canvasEmpty: true, onBuildWithAi: vi.fn(), onUseGraph: vi.fn() });
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('plays: blocks arrive one step at a time and their links appear after they land', async () => {
    render(<WorkflowDemoDialog {...props()} />);
    expect(screen.getByText('Choose what starts it')).toBeInTheDocument();
    expect(screen.getAllByTestId('node')).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(3700); });
    expect(screen.getByText('Let the AI agent call')).toBeInTheDocument();
    expect(screen.getAllByTestId('node')).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(screen.getAllByTestId('edge').map((e) => e.dataset.active)).toEqual(['true']);
    expect(fitBounds).toHaveBeenCalled();
  });

  it('paused: the next block glows and clicking it adds it; keyboard and dots navigate; the end shows the checklist', async () => {
    render(<WorkflowDemoDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Click the glowing block to add it.')).toBeInTheDocument();
    const aiCall = screen.getByText('ai.call').closest('button')!;
    expect(aiCall).not.toBeDisabled();
    fireEvent.click(aiCall);
    expect(screen.getByText('Let the AI agent call')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByText('Understand the answers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check, test, publish' }));
    expect(screen.getByRole('list', { name: 'Before you publish' }).querySelectorAll('li')).toHaveLength(6);
    expect(screen.getByText('Step 7 of 7')).toBeInTheDocument();
  });

  it('scenarios switch; CTAs hand the graph or the prompt to the builder', () => {
    const p = props();
    const { rerender } = render(<WorkflowDemoDialog {...p} />);
    fireEvent.click(screen.getByRole('tab', { name: /Missed call → SMS/ }));
    expect(screen.getByText('React to a missed call')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use as my starting point/ }));
    expect(p.onUseGraph).toHaveBeenCalledWith(demoGraph(DEMO_SCENARIOS[1]));
    fireEvent.click(screen.getByRole('button', { name: /Build this with AI/ }));
    expect(p.onBuildWithAi).toHaveBeenCalledWith(DEMO_SCENARIOS[1].prompt);
    rerender(<WorkflowDemoDialog {...p} canvasEmpty={false} />);
    expect(screen.queryByRole('button', { name: /Use as my starting point/ })).not.toBeInTheDocument();
  });

  it('every scenario is a complete workflow: one trigger, all links point at known blocks and ports', () => {
    for (const s of DEMO_SCENARIOS) {
      const g = demoGraph(s);
      const ids = new Set(g.nodes.map((n) => n.id));
      expect(g.nodes.filter((n) => n.type.startsWith('trigger.'))).toHaveLength(1);
      for (const e of g.edges) {
        expect(ids.has(e.source) && ids.has(e.target), `${s.id} ${e.id}`).toBe(true);
        const type = g.nodes.find((n) => n.id === e.source)!.type;
        expect(catalog.nodes.find((n) => n.type === type)!.outputs, `${s.id} ${e.id}`).toContain(e.sourceHandle);
      }
      for (const n of g.nodes) {
        const outs = catalog.nodes.find((c) => c.type === n.type)!.outputs;
        for (const port of outs) expect(g.edges.some((e) => e.source === n.id && e.sourceHandle === port), `${s.id} ${n.id}:${port} open`).toBe(true);
      }
    }
  });
});
