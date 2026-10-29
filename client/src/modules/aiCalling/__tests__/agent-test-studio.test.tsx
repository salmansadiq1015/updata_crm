// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Campaign } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({
  startWebTest: vi.fn(),
  getCall: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  setMicrophoneEnabled: vi.fn(),
  callbacks: {} as Record<string, (...args: unknown[]) => void>,
  textStreams: {} as Record<string, (reader: unknown, from: { identity: string }) => void>,
  agentPresent: true,
}));

vi.mock('../services/ai-calling-api', () => ({
  aiCallingApi: { startWebTest: mocks.startWebTest, getCall: mocks.getCall },
}));

vi.mock('livekit-client', () => ({
  Room: class MockRoom {
    remoteParticipants = new Map(mocks.agentPresent ? [['agent-1', { identity: 'agent-1', isLocal: false }]] : []);
    localParticipant = { identity: 'tester', setMicrophoneEnabled: mocks.setMicrophoneEnabled };
    registerTextStreamHandler(topic: string, handler: (reader: unknown, from: { identity: string }) => void) {
      mocks.textStreams[topic] = handler;
    }
    connect = mocks.connect;
    disconnect = mocks.disconnect;
    on(event: string, callback: (...args: unknown[]) => void) {
      mocks.callbacks[event] = callback;
      return this;
    }
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    TranscriptionReceived: 'transcriptionReceived',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
    Disconnected: 'disconnected',
    ParticipantAttributesChanged: 'participantAttributesChanged',
  },
  DisconnectReason: { CLIENT_INITIATED: 1, ROOM_DELETED: 5 },
  Track: { Kind: { Audio: 'audio' } },
}));

const summary = {
  total: 2, eligible: 2, ineligible: 0, queued: 0, inProgress: 0, completed: 0, answered: 0,
  noAnswer: 0, failed: 0, retryScheduled: 0, qualified: 0, unqualified: 0, callbacks: 0,
  needsReview: 0, doNotContact: 0, suppressed: 0, missingPhone: 0, totalCallSeconds: 0, actualCost: 0,
};

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  _id: 'campaign-1', name: 'Dental follow-up', status: 'draft', questionnaireVersion: 1,
  questionnaire: {
    questions: [
      { fieldKey: 'availability', label: 'Availability', text: 'Would Thursday afternoon work?', type: 'short_text', order: 1 },
      { fieldKey: 'confirm', label: 'Confirm', text: 'Should I confirm that time?', type: 'boolean', order: 2 },
    ],
  },
  statusRules: [],
  agentConfig: { agentName: 'Maya', voice: 'coral', speakingStyle: 'friendly', objective: 'Reschedule the cleaning.' },
  schedule: {}, summary, channel: 'voice', transport: 'cloud_sip',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.callbacks = {};
  mocks.textStreams = {};
  mocks.agentPresent = true;
  mocks.startWebTest.mockResolvedValue({ callId: 'call-1', recordId: 'record-1', roomName: 'room-1', url: 'wss://livekit.test', token: 'token' });
  mocks.getCall.mockResolvedValue({ failureMessage: null });
  mocks.connect.mockResolvedValue(undefined);
  mocks.disconnect.mockResolvedValue(undefined);
  mocks.setMicrophoneEnabled.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
});

function renderWithQuery(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('Agent test entry point', () => {
  it('makes browser testing visible from the calling dashboard', async () => {
    const onOpen = vi.fn();
    const { AgentTestLauncher } = await import('../ui/agent-test-studio');
    render(<AgentTestLauncher campaigns={[campaign()]} livekitReady onOpen={onOpen} />);

    expect(screen.getByRole('heading', { name: 'Agent test studio' })).toBeTruthy();
    expect(screen.getByText(/Talk to/).textContent).toContain('Maya');
    fireEvent.click(screen.getByRole('button', { name: 'Open test studio' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows the selected agent, objective, flow and readiness inside the studio', async () => {
    const { AgentTestStudio } = await import('../ui/agent-test-studio');
    renderWithQuery(
      <AgentTestStudio
        campaigns={[campaign()]}
        telephony={{ configured: false, livekitReady: true, reachable: true, eligible: false, reason: 'no_sip_trunk' }}
        onClose={vi.fn()}
        onCreateCampaign={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('Campaign')).toHaveValue('campaign-1');
    expect(screen.getByText('Reschedule the cleaning.')).toBeTruthy();
    expect(screen.getByText('Would Thursday afternoon work?')).toBeTruthy();
    expect(screen.getByText('Voice route is configured')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start test session' })).toBeEnabled();
    expect(document.body).toHaveClass('agent-test-studio-open');
  });

  it('guides an empty account to create its first calling campaign', async () => {
    const create = vi.fn();
    const close = vi.fn();
    const { AgentTestStudio } = await import('../ui/agent-test-studio');
    renderWithQuery(<AgentTestStudio campaigns={[]} onClose={close} onCreateCampaign={create} />);

    expect(screen.getByText('Create a voice campaign to test')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create calling campaign' }));
    expect(close).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });
});

describe('WebCallConsole', () => {
  it('can pause the visualization without starting a call', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause orb animation' }));
    expect(screen.getByRole('img', { name: 'Voice agent is idle' })).toHaveAttribute('data-motion', 'reduced');
    expect(mocks.startWebTest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable orb animation' }));
    expect(screen.getByRole('img', { name: 'Voice agent is idle' })).toHaveAttribute('data-motion', 'full');
  });

  it('follows worker conversation states even without captions and ignores stale speaker events', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onStatusChange = vi.fn();
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    act(() => { mocks.callbacks.trackSubscribed?.({ kind: 'audio', attach: vi.fn() }); });

    for (const [state, label] of [['thinking', 'processing'], ['speaking', 'speaking'], ['listening', 'listening']]) {
      act(() => { mocks.callbacks.participantAttributesChanged?.(
        { 'lk.agent.state': state },
        { identity: 'agent-1', attributes: { 'lk.agent.state': state } },
      ); });
      expect(screen.getByRole('img')).toHaveAttribute('data-state', label);
      expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ orbState: label }));
    }
    act(() => { mocks.callbacks.activeSpeakersChanged?.([{ identity: 'agent-1', audioLevel: 0.8 }]); });
    expect(screen.getByRole('img')).toHaveAttribute('data-state', 'listening');
  });

  it('connects the real browser call and exposes transcript, mute and hang-up controls', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(mocks.startWebTest).toHaveBeenCalledWith('campaign-1'));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    expect(mocks.connect).toHaveBeenCalledWith('wss://livekit.test', 'token');
    expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    act(() => {
      mocks.callbacks.transcriptionReceived?.(
        [{ id: 'agent-line', text: 'How can I help today?', final: true, firstReceivedTime: 1 }],
        { identity: 'agent-1', isLocal: false },
      );
      mocks.callbacks.transcriptionReceived?.(
        [{ id: 'tester-line', text: 'I need to reschedule.', final: true, firstReceivedTime: 2 }],
        { identity: 'tester', isLocal: true },
      );
    });
    expect(screen.getByText('How can I help today?')).toBeTruthy();
    expect(screen.getByText('I need to reschedule.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await waitFor(() => expect(mocks.setMicrophoneEnabled).toHaveBeenLastCalledWith(false));
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'End test' }));
    expect(screen.getByRole('alertdialog', { name: 'End test session' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalled());
    expect(screen.getByText('Test call ended')).toBeTruthy();
  });

  it('shows captions from the agent\'s transcription text streams (current agents)', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    const stream = (id: string, chunks: string[]) => Object.assign((async function* gen() { for (const c of chunks) yield c; }()), {
      info: { id, attributes: { 'lk.segment_id': id } },
    });
    await act(async () => {
      mocks.textStreams['lk.transcription']?.(stream('seg-a', ['Hi, this is ', 'Maya from the clinic.']), { identity: 'agent-1' });
      mocks.textStreams['lk.transcription']?.(stream('seg-t', ['Hello Maya.']), { identity: 'tester' });
    });
    await waitFor(() => expect(screen.getByText('Hi, this is Maya from the clinic.')).toBeTruthy());
    expect(screen.getByText('Hello Maya.')).toBeTruthy();
  });

  it('shows each line once when the agent sends captions on both channels, and finishes "partial" lines', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    const stream = (id: string, chunks: string[]) => Object.assign((async function* gen() { for (const c of chunks) yield c; }()), {
      info: { id, attributes: { 'lk.segment_id': id } },
    });
    await act(async () => {
      // Current agents publish the same caption as a text stream AND as a legacy event (other id).
      mocks.textStreams['lk.transcription']?.(stream('SG_agent_1', ['When would you want ', 'to take action on this?']), { identity: 'agent-1' });
      mocks.callbacks.transcriptionReceived?.(
        [{ id: 'legacy-1', text: 'When would you want to take action on this?', final: false, firstReceivedTime: 1 }],
        { identity: 'agent-1', isLocal: false },
      );
      mocks.textStreams['lk.transcription']?.(stream('SG_user_1', ['What type of services are you providing?']), { identity: 'tester' });
      mocks.callbacks.transcriptionReceived?.(
        [{ id: 'legacy-2', text: 'What type of services are you providing?', final: true, firstReceivedTime: 2 }],
        { identity: 'tester', isLocal: true },
      );
    });
    await waitFor(() => expect(screen.getAllByText('When would you want to take action on this?')).toHaveLength(1));
    expect(screen.getAllByText('What type of services are you providing?')).toHaveLength(1);
    expect(screen.queryByText(/partial/i)).toBeNull();
  });

  it('says why when the voice agent never joins, instead of waiting forever', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.agentPresent = false;
      const { WebCallConsole } = await import('../ui/web-call-console');
      render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
      fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
      await waitFor(() => expect(screen.getByText('Waiting for the voice agent')).toBeTruthy());
      await act(async () => { vi.advanceTimersByTime(30_000); });
      expect(await screen.findByRole('alert')).toHaveTextContent('agent worker is running');
      expect(screen.getByText('Browser call unavailable')).toBeTruthy();
      expect(mocks.disconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the reason the agent reports (e.g. an expired OpenAI key) instead of "Test call ended"', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    const reason = 'OpenAI rejected the voice agent\'s API key (invalid, revoked or expired).';
    act(() => {
      mocks.callbacks.participantAttributesChanged?.(
        { 'updata.agent_error': '' },
        { identity: 'agent-1', isLocal: false, attributes: { 'updata.agent_error': JSON.stringify({ code: 'OPENAI_KEY_INVALID', message: reason }) } },
      );
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('revoked or expired');
    act(() => { mocks.callbacks.disconnected?.(5); });
    await waitFor(() => expect(screen.getByText('Browser call unavailable')).toBeTruthy());
    expect(screen.queryByText('Test call ended')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('revoked or expired');
  });

  it('falls back to the failure the CRM recorded when the agent closes the room silently', async () => {
    mocks.getCall.mockResolvedValue({ failureMessage: 'The voice agent could not load this call from the CRM at http://localhost:9097 (Unauthorized).' });
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    act(() => { mocks.callbacks.disconnected?.(5); });
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load this call from the CRM');
    expect(mocks.getCall).toHaveBeenCalledWith('record-1');
    expect(screen.getByText('Browser call unavailable')).toBeTruthy();
  });

  it('still reports a normal end once the agent has talked', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(screen.getByText('Live browser call')).toBeTruthy());
    act(() => {
      mocks.callbacks.trackSubscribed?.({ kind: 'audio', attach: vi.fn(), mediaStreamTrack: undefined });
      mocks.callbacks.disconnected?.(5);
    });
    await waitFor(() => expect(screen.getByText('Test call ended')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('closing during the microphone publish waits for it before leaving the room (no orphaned publish)', async () => {
    let finishPublish: () => void = () => {};
    mocks.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPublish = resolve; }));
    const { WebCallConsole } = await import('../ui/web-call-console');
    const { unmount } = render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    await waitFor(() => expect(mocks.setMicrophoneEnabled).toHaveBeenCalledWith(true));

    unmount(); // the studio is closed while the server has not confirmed the microphone yet
    await new Promise((r) => { setTimeout(r, 30); });
    expect(mocks.disconnect).not.toHaveBeenCalled();
    finishPublish();
    await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledTimes(1));
  });

  it('explains a microphone publish timeout in plain words', async () => {
    mocks.setMicrophoneEnabled.mockRejectedValueOnce(new Error('publication of local track timed out, no response from server'));
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not confirm it within 10 seconds');
  });

  it('does not start when the campaign has no testable lead context', async () => {
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" disabledReason="This campaign has no leads." />);
    const button = screen.getByRole('button', { name: 'Start test session' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.startWebTest).not.toHaveBeenCalled();
  });

  it('reports a denied microphone permission without claiming the call is live', async () => {
    mocks.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    const { WebCallConsole } = await import('../ui/web-call-console');
    render(<WebCallConsole campaignId="campaign-1" agentName="Maya" />);

    fireEvent.click(screen.getByRole('button', { name: 'Start test session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was denied');
    expect(screen.getByText('Browser call unavailable')).toBeTruthy();
    expect(screen.queryByText('Live browser call')).toBeNull();
    expect(mocks.disconnect).toHaveBeenCalled();
  });
});
