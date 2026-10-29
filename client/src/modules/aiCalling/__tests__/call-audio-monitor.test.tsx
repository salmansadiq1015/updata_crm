// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({ monitor: vi.fn(), connect: vi.fn(), startAudio: vi.fn(), rooms: [] as Array<Record<string, unknown>>, tracks: [] as Array<{ attach: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn>; setVolume: ReturnType<typeof vi.fn> }> }));
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: { monitorCall: mock.monitor } }));
vi.mock('livekit-client', () => ({
  RoomEvent: { TrackSubscribed: 'subscribed', TrackUnsubscribed: 'unsubscribed', TrackSubscriptionFailed: 'subscriptionFailed', AudioPlaybackStatusChanged: 'playback', Disconnected: 'disconnected', Reconnecting: 'reconnecting', SignalReconnecting: 'signalReconnecting', Reconnected: 'reconnected' },
  Track: { Kind: { Audio: 'audio' } },
  Room: class {
    canPlaybackAudio = true;
    connect = mock.connect; disconnect = vi.fn(async () => {}); startAudio = mock.startAudio;
    removeAllListeners = vi.fn(); on = vi.fn(() => this);
    remoteParticipants = new Map();
    constructor(public options: unknown) {
      for (const speaker of ['agent', 'lead']) {
        const track = { kind: 'audio', attach: vi.fn(() => document.createElement('audio')), detach: vi.fn(), setVolume: vi.fn() };
        mock.tracks.push(track);
        this.remoteParticipants.set(speaker, { trackPublications: new Map([['speech', { track }]]) });
      }
      mock.rooms.push(this as unknown as Record<string, unknown>);
    }
  },
}));
const { CallAudioMonitor } = await import('../ui/call-audio-monitor');
beforeEach(() => {
  vi.clearAllMocks(); mock.rooms.length = 0; mock.tracks.length = 0;
  mock.connect.mockResolvedValue(undefined);
  mock.startAudio.mockResolvedValue(undefined);
  mock.monitor.mockResolvedValue({ url: 'wss://voice.example.test', token: 'receive-only-token' });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe('live conversation speakers', () => {
  it('plays both remote voices without microphone access and detaches all audio on stop', async () => {
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    expect(await screen.findByRole('button', { name: 'Stop listening' })).toBeTruthy();
    expect(mock.monitor).toHaveBeenCalledWith('call-1', expect.any(AbortSignal));
    expect(mock.rooms[0].connect).toHaveBeenCalledWith('wss://voice.example.test', 'receive-only-token', { autoSubscribe: true, peerConnectionTimeout: 15_000, websocketTimeout: 15_000 });
    expect(mock.tracks).toHaveLength(2);
    for (const track of mock.tracks) expect(track.attach).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Speaker volume'), { target: { value: '40' } });
    expect([...document.querySelectorAll('audio')].every(node => node.volume === 0.4)).toBe(true);
    for (const track of mock.tracks) expect(track.setVolume).toHaveBeenLastCalledWith(0.4);
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(mock.rooms[0].disconnect).toHaveBeenCalledOnce();
    for (const track of mock.tracks) expect(track.detach).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });
  it('stops listening automatically when the call ends or another view starts listening', async () => {
    const view = render(<><div data-testid="one"><CallAudioMonitor callId="call-1" live /></div><div data-testid="two"><CallAudioMonitor callId="call-1" live /></div></>);
    fireEvent.click(within(screen.getByTestId('one')).getByRole('button', { name: 'Listen to both voices' }));
    await within(screen.getByTestId('one')).findByRole('button', { name: 'Stop listening' });
    fireEvent.click(within(screen.getByTestId('two')).getByRole('button', { name: 'Listen to both voices' }));
    await within(screen.getByTestId('two')).findByRole('button', { name: 'Stop listening' });
    expect(mock.rooms[0].disconnect).toHaveBeenCalledOnce();
    view.rerender(<CallAudioMonitor callId="call-1" live={false} />);
    await waitFor(() => expect(mock.rooms[1].disconnect).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Listen to both voices' })).toBeDisabled();
  });
  it('shows connection errors, permits retry, and does not attach leaked audio', async () => {
    mock.monitor.mockRejectedValueOnce({ message: 'Call is no longer live' });
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Call is no longer live');
    expect(mock.rooms).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    expect(await screen.findByRole('button', { name: 'Stop listening' })).toBeTruthy();
  });
  it('lets the user unlock browser audio playback explicitly', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('autoplay blocked'));
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enable audio' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enable audio' })).toBeNull());
  });

  it('cancels pending credentials and ignores their late arrival', async () => {
    let resolve!: (value: unknown) => void;
    mock.monitor.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    const signal = mock.monitor.mock.calls[0][1] as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }));
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ url: 'wss://voice.example.test', token: 'late' }); });
    expect(mock.rooms).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Listen to both voices' })).toBeEnabled();
  });

  it('disconnects an in-flight room and never attaches late audio after cancellation', async () => {
    let resolve!: () => void;
    mock.connect.mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    await waitFor(() => expect(mock.rooms).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }));
    expect(mock.rooms[0].disconnect).toHaveBeenCalled();
    await act(async () => { resolve(); });
    for (const track of mock.tracks) expect(track.attach).not.toHaveBeenCalled();
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('shows reconnection progress and returns to listening when the room recovers', async () => {
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    await screen.findByRole('button', { name: 'Stop listening' });
    const emit = (event: string) => {
      const on = mock.rooms[0].on as ReturnType<typeof vi.fn>;
      const handler = on.mock.calls.find(([name]) => name === event)?.[1] as () => void;
      act(handler);
    };
    emit('reconnecting');
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting audio');
    emit('reconnected');
    expect(screen.getByRole('status')).toHaveTextContent('Listening to AI agent and lead');
    emit('disconnected');
    expect(screen.getByRole('alert')).toHaveTextContent('Live audio disconnected');
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('unlocks speakers inside the click before credentials arrive and closes the audio context on stop', async () => {
    const resume = vi.fn(async () => {});
    const close = vi.fn(async () => {});
    vi.stubGlobal('AudioContext', class { state = 'running'; resume = resume; close = close; });
    let resolve!: (value: unknown) => void;
    mock.monitor.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    expect(resume).toHaveBeenCalledOnce();
    expect(mock.rooms).toHaveLength(0);
    await act(async () => resolve({ url: 'wss://voice.example.test', token: 'receive-only-token' }));
    await screen.findByRole('button', { name: 'Stop listening' });
    expect(mock.rooms[0].options).toEqual(expect.objectContaining({ webAudioMix: { audioContext: expect.objectContaining({ resume }) } }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('remains cancellable when playback is waiting for media and reports subscription failures', async () => {
    mock.startAudio.mockReturnValue(new Promise(() => {}));
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    await screen.findByRole('button', { name: 'Stop listening' });
    const on = mock.rooms[0].on as ReturnType<typeof vi.fn>;
    act(on.mock.calls.find(([name]) => name === 'subscriptionFailed')![1]);
    expect(screen.getByRole('alert')).toHaveTextContent('A voice track could not be received');
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(mock.rooms[0].disconnect).toHaveBeenCalledOnce();
  });
});
