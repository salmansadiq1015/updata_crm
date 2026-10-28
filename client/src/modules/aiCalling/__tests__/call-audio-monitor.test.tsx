// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({ monitor: vi.fn(), rooms: [] as Array<Record<string, unknown>>, tracks: [] as Array<{ attach: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn> }> }));
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: { monitorCall: mock.monitor } }));
vi.mock('livekit-client', () => ({
  RoomEvent: { TrackSubscribed: 'subscribed', TrackUnsubscribed: 'unsubscribed', AudioPlaybackStatusChanged: 'playback', Disconnected: 'disconnected' },
  Track: { Kind: { Audio: 'audio' } },
  Room: class {
    canPlaybackAudio = true;
    connect = vi.fn(async () => {}); disconnect = vi.fn(async () => {}); startAudio = vi.fn(async () => {});
    removeAllListeners = vi.fn(); on = vi.fn(() => this);
    remoteParticipants = new Map();
    constructor() {
      for (const speaker of ['agent', 'lead']) {
        const track = { kind: 'audio', attach: vi.fn(() => document.createElement('audio')), detach: vi.fn() };
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
  mock.monitor.mockResolvedValue({ url: 'wss://voice.example.test', token: 'receive-only-token' });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
describe('live conversation speakers', () => {
  it('plays both remote voices without microphone access and detaches all audio on stop', async () => {
    render(<CallAudioMonitor callId="call-1" live />);
    fireEvent.click(screen.getByRole('button', { name: 'Listen to both voices' }));
    expect(await screen.findByRole('button', { name: 'Stop listening' })).toBeTruthy();
    expect(mock.monitor).toHaveBeenCalledWith('call-1');
    expect(mock.rooms[0].connect).toHaveBeenCalledWith('wss://voice.example.test', 'receive-only-token', { autoSubscribe: true });
    expect(mock.tracks).toHaveLength(2);
    for (const track of mock.tracks) expect(track.attach).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Speaker volume'), { target: { value: '40' } });
    expect([...document.querySelectorAll('audio')].every(node => node.volume === 0.4)).toBe(true);
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
});
