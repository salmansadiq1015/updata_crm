import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const service = vi.hoisted(() => ({
  createSession: vi.fn(),
  runTool: vi.fn(),
  exchangeSdp: vi.fn(),
}));
vi.mock('../live-voice-service', () => ({ liveVoiceService: service }));

import { useLiveVoice } from '../use-live-voice';

// ── Fake WebRTC ────────────────────────────────────────────────────────────
let lastPc;
let lastDc;
let micTrack;

class FakeDataChannel {
  constructor() { this.readyState = 'connecting'; this.sent = []; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 'closed'; }
  open() { this.readyState = 'open'; this.onopen?.(); }
  emit(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class FakePeerConnection {
  constructor() { lastPc = this; this.connectionState = 'new'; this.tracks = []; }
  addTrack(track) { this.tracks.push(track); }
  createDataChannel(name) { this.dcName = name; lastDc = new FakeDataChannel(); return lastDc; }
  async createOffer() { return { type: 'offer', sdp: 'v=0 offer' }; }
  async setLocalDescription(d) { this.local = d; }
  async setRemoteDescription(d) { this.remote = d; }
  getSenders() { return this.tracks.map((track) => ({ track })); }
  close() { this.closed = true; }
}

function sentOfType(type) { return lastDc.sent.filter((e) => e.type === type); }

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function connect(hook, opts = { voice: 'cedar', locale: 'de', threadId: 'thread-9' }) {
  await act(async () => { await hook.result.current.start(opts); });
  await act(async () => { lastDc.open(); });
}

beforeEach(() => {
  micTrack = { enabled: true, stop: vi.fn(), kind: 'audio' };
  const stream = { getAudioTracks: () => [micTrack], getTracks: () => [micTrack] };
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });
  globalThis.RTCPeerConnection = FakePeerConnection;
  service.createSession.mockResolvedValue({
    clientSecret: 'ek_1', threadId: 'thread-9', model: 'gpt-realtime', voice: 'cedar',
    pages: { tasks: '/tasks', leads: '/leads' },
  });
  service.exchangeSdp.mockResolvedValue('v=0 answer');
  service.runTool.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.RTCPeerConnection;
});

describe('useLiveVoice', () => {
  test('connects: mic → session → SDP exchange → data channel → greeting', async () => {
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: true, noiseSuppression: true }) });
    expect(service.createSession).toHaveBeenCalledWith(expect.objectContaining({ voice: 'cedar', locale: 'de', threadId: 'thread-9', timeZone: expect.any(String) }));
    expect(service.exchangeSdp).toHaveBeenCalledWith({ sdp: 'v=0 offer', clientSecret: 'ek_1' });
    expect(lastPc.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
    expect(lastPc.dcName).toBe('oai-events');
    expect(lastPc.tracks).toContain(micTrack);
    expect(hook.result.current.status).toBe('live');
    expect(sentOfType('response.create')).toHaveLength(1);
  });

  test('server events drive activity and captions', async () => {
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    act(() => lastDc.emit({ type: 'input_audio_buffer.speech_started', item_id: 'u1' }));
    expect(hook.result.current.activity).toBe('user_speaking');
    act(() => lastDc.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Wie sieht mein Tag aus?' }));
    act(() => lastDc.emit({ type: 'output_audio_buffer.started' }));
    act(() => lastDc.emit({ type: 'response.output_audio_transcript.delta', item_id: 'a1', delta: 'Sie haben' }));
    expect(hook.result.current.activity).toBe('speaking');
    expect(hook.result.current.transcript.map((i) => i.text)).toEqual(['Wie sieht mein Tag aus?', 'Sie haben']);
  });

  test('runs a server tool in the voice thread and returns its output to the model', async () => {
    service.runTool.mockResolvedValue({
      result: { status: 'completed', message: 'Aufgabe erstellt' },
      display: { kind: 'agent_run', runId: 'r1', threadId: 'thread-9', output: { message: 'Aufgabe erstellt', recordType: 'task', recordId: 't1' } },
    });
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    await act(async () => {
      lastDc.emit({ type: 'response.done', response: { status: 'completed', output: [
        { type: 'function_call', call_id: 'call_1', name: 'crm_request', arguments: JSON.stringify({ request: 'Create task boiler check' }) },
      ] } });
    });
    await waitFor(() => expect(sentOfType('conversation.item.create')).toHaveLength(1));
    expect(service.runTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'crm_request', arguments: { request: 'Create task boiler check' }, threadId: 'thread-9' }));
    const [output] = sentOfType('conversation.item.create');
    expect(output.item).toMatchObject({ type: 'function_call_output', call_id: 'call_1' });
    expect(JSON.parse(output.item.output)).toEqual({ status: 'completed', message: 'Aufgabe erstellt' });
    expect(sentOfType('response.create')).toHaveLength(2); // greeting + after tool
    expect(hook.result.current.actions[0]).toMatchObject({ name: 'crm_request', status: 'completed', display: { kind: 'agent_run' } });
    expect(hook.result.current.activity).not.toBe('working');
  });

  test('several calls in one response → one follow-up response', async () => {
    service.runTool.mockResolvedValue({ result: { status: 'completed' }, display: null });
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    await act(async () => {
      lastDc.emit({ type: 'response.done', response: { output: [
        { type: 'function_call', call_id: 'a', name: 'list_calendar', arguments: '{}' },
        { type: 'function_call', call_id: 'b', name: 'list_follow_ups', arguments: '{}' },
      ] } });
    });
    await waitFor(() => expect(sentOfType('conversation.item.create')).toHaveLength(2));
    expect(sentOfType('response.create')).toHaveLength(2);
  });

  test('a failing tool still answers the model (no hung turn)', async () => {
    service.runTool.mockRejectedValue(new Error('Network Error'));
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    await act(async () => {
      lastDc.emit({ type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'x', name: 'search_leads', arguments: '{}' }] } });
    });
    await waitFor(() => expect(sentOfType('conversation.item.create')).toHaveLength(1));
    expect(JSON.parse(sentOfType('conversation.item.create')[0].item.output)).toMatchObject({ status: 'failed' });
    expect(hook.result.current.actions[0].status).toBe('failed');
  });

  test('open_page runs in the browser and keeps the conversation going', async () => {
    const onOpenPage = vi.fn();
    const hook = renderHook(() => useLiveVoice({ onOpenPage }), { wrapper });
    await connect(hook);
    await act(async () => {
      lastDc.emit({ type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'p', name: 'open_page', arguments: '{"page":"leads"}' }] } });
    });
    await waitFor(() => expect(onOpenPage).toHaveBeenCalledWith('/leads', 'leads'));
    expect(service.runTool).not.toHaveBeenCalled();
    expect(hook.result.current.status).toBe('live');
    expect(JSON.parse(sentOfType('conversation.item.create')[0].item.output)).toMatchObject({ status: 'completed', opened: 'leads' });
  });

  test('end_conversation hangs up after the goodbye finishes playing', async () => {
    const onEnded = vi.fn();
    const hook = renderHook(() => useLiveVoice({ onEnded }), { wrapper });
    await connect(hook);
    act(() => lastDc.emit({ type: 'output_audio_buffer.started' }));
    await act(async () => {
      lastDc.emit({ type: 'response.done', response: { output: [{ type: 'function_call', call_id: 'e', name: 'end_conversation', arguments: '{}' }] } });
    });
    expect(hook.result.current.status).toBe('live');
    act(() => lastDc.emit({ type: 'output_audio_buffer.stopped' }));
    await waitFor(() => expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-9', reason: 'assistant' })));
    await waitFor(() => expect(hook.result.current.status).toBe('ended'));
    expect(micTrack.stop).toHaveBeenCalled();
    expect(lastPc.closed).toBe(true);
    expect(sentOfType('response.create')).toHaveLength(1); // no reply after goodbye
  });

  test('mute disables the mic track; typed text is sent as a user message', async () => {
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    act(() => hook.result.current.toggleMute());
    expect(micTrack.enabled).toBe(false);
    expect(hook.result.current.muted).toBe(true);
    act(() => hook.result.current.toggleMute());
    expect(micTrack.enabled).toBe(true);

    act(() => hook.result.current.sendText('  Zeig meine Leads  '));
    const [item] = sentOfType('conversation.item.create');
    expect(item.item).toEqual({ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Zeig meine Leads' }] });
    expect(hook.result.current.transcript.at(-1)).toMatchObject({ role: 'user', text: 'Zeig meine Leads' });
  });

  test('interrupt cancels the response and clears queued audio', async () => {
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await connect(hook);
    act(() => hook.result.current.interrupt());
    expect(sentOfType('response.cancel')).toHaveLength(1);
    expect(sentOfType('output_audio_buffer.clear')).toHaveLength(1);
  });

  test('microphone refused → error, no session is created', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await act(async () => { await hook.result.current.start({}); });
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.error).toBe('mic_denied');
    expect(service.createSession).not.toHaveBeenCalled();
  });

  test('server says unavailable → error "unavailable" and the mic is released', async () => {
    service.createSession.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'VOICE_AGENT_UNAVAILABLE', statusCode: 503 }));
    const hook = renderHook(() => useLiveVoice(), { wrapper });
    await act(async () => { await hook.result.current.start({}); });
    expect(hook.result.current.error).toBe('unavailable');
    expect(micTrack.stop).toHaveBeenCalled();
  });

  test('hanging up while the mic prompt is open never starts a session', async () => {
    let grant;
    navigator.mediaDevices.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => { grant = resolve; }));
    const onEnded = vi.fn();
    const hook = renderHook(() => useLiveVoice({ onEnded }), { wrapper });
    let pending;
    act(() => { pending = hook.result.current.start({}); });
    expect(hook.result.current.status).toBe('connecting');
    act(() => hook.result.current.end('user'));
    await act(async () => { grant({ getAudioTracks: () => [micTrack], getTracks: () => [micTrack] }); await pending; });
    expect(service.createSession).not.toHaveBeenCalled();
    expect(micTrack.stop).toHaveBeenCalled();
    expect(hook.result.current.status).toBe('ended');
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'user', hadSession: false }));
  });

  test('a dropped data channel while live is reported as a lost connection', async () => {
    const onEnded = vi.fn();
    const hook = renderHook(() => useLiveVoice({ onEnded }), { wrapper });
    await connect(hook);
    act(() => lastDc.onclose());
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.error).toBe('connection_lost');
    expect(onEnded).toHaveBeenCalledWith(expect.objectContaining({ reason: 'connection_lost' }));
  });
});
