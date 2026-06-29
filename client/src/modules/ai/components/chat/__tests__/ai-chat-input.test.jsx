import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AiChatInput } from '../ai-chat-input';
import { SESSION_STATUSES } from '../../../constants/ai-constants';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback || _key,
  }),
}));

const baseRecorder = {
  recordingState: 'idle',
  uploadProgress: 0,
  elapsed: 0,
  isWarning: false,
  getWaveformData: () => [],
  stopWaveform: () => {},
  stopRecording: () => {},
};

function renderInput(overrides = {}) {
  const voiceSession = {
    session: {
      _id: 'voice-1',
      status: SESSION_STATUSES.AWAITING_CONFIRMATION,
      rawTranscript: 'Create order for Muller tomorrow',
      transcriptConfidence: 0.94,
      entities: [],
    },
    submitCorrections: vi.fn(() => Promise.resolve()),
    confirmSession: vi.fn(() => Promise.resolve({
      _id: 'voice-1',
      result: { message: 'Voice action completed.' },
    })),
    cancelSession: vi.fn(),
    isCancelling: false,
    isConfirming: false,
    ...overrides.voiceSession,
  };
  const onVoiceConfirmed = vi.fn();

  render(
    <AiChatInput
      onSubmit={() => {}}
      isDispatching={false}
      recorder={baseRecorder}
      voiceSession={voiceSession}
      voiceState="idle"
      transcript={{ final: '', partial: '', confidence: null }}
      onStartListening={() => {}}
      onStopListening={() => {}}
      isSTTSupported={false}
      onVoiceConfirmed={onVoiceConfirmed}
      {...overrides.props}
    />,
  );

  return { voiceSession, onVoiceConfirmed };
}

describe('AiChatInput voice review', () => {
  test('submits corrected transcript before confirming a voice session', async () => {
    const { voiceSession, onVoiceConfirmed } = renderInput();

    fireEvent.change(screen.getByTestId('ai-chat-transcript-review'), {
      target: { value: 'Create order for Mueller tomorrow' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ai.confirm.confirmArrow' }));

    await waitFor(() => {
      expect(voiceSession.submitCorrections).toHaveBeenCalledWith({
        correctedTranscript: 'Create order for Mueller tomorrow',
      });
    });
    expect(voiceSession.confirmSession).toHaveBeenCalledTimes(1);
    expect(onVoiceConfirmed).toHaveBeenCalledWith({
      session: {
        _id: 'voice-1',
        result: { message: 'Voice action completed.' },
      },
      transcriptText: 'Create order for Mueller tomorrow',
    });
  });

  test('blocks confirmation when the transcript is empty', () => {
    const { voiceSession } = renderInput({
      voiceSession: {
        session: {
          _id: 'voice-empty',
          status: SESSION_STATUSES.AWAITING_CONFIRMATION,
          rawTranscript: '',
          entities: [],
        },
      },
    });

    expect(screen.getByText('A transcript is required before the assistant can continue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ai.confirm.confirmArrow' })).toBeDisabled();
    expect(voiceSession.confirmSession).not.toHaveBeenCalled();
  });
});
