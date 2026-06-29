import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useAiChat } from '../use-ai-chat';
import { AGENT_STATUSES } from '../../constants/ai-constants';

const dispatchMock = vi.fn();

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback || _key,
  }),
}));

vi.mock('@/lib/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('../../services/ai-agent-service', () => ({
  aiAgentService: {
    dispatch: (...args) => dispatchMock(...args),
    list: vi.fn(() => Promise.resolve([])),
    getThread: vi.fn(() => Promise.resolve([])),
    confirm: vi.fn(() => Promise.resolve({})),
    archiveThread: vi.fn(() => Promise.resolve({})),
    deleteThread: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('../use-voice-session', () => ({
  useVoiceSession: () => ({
    onAudioUploaded: vi.fn(),
  }),
}));

vi.mock('../use-audio-recorder', () => ({
  useAudioRecorder: () => ({
    recordingState: 'idle',
  }),
}));

function wrapper({ children }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useAiChat', () => {
  test('keeps failed dispatches visible as retryable pending runs', async () => {
    dispatchMock.mockRejectedValueOnce({
      code: 'NETWORK_ERROR',
      message: 'Server not reachable. Please try again.',
      statusCode: 0,
      isNetworkError: true,
    });

    const { result } = renderHook(
      () => useAiChat({
        selectedThreadId: null,
        currentThreadId: 'thread-1',
        onThreadSelected: vi.fn(),
        onThreadDeleted: vi.fn(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('create order for Mueller');
    });

    await waitFor(() => {
      expect(result.current.pendingRuns).toHaveLength(1);
      expect(result.current.pendingRuns[0].status).toBe(AGENT_STATUSES.FAILED);
    });

    expect(result.current.pendingRuns[0]).toMatchObject({
      threadId: 'thread-1',
      input: 'create order for Mueller',
      error: {
        code: 'NETWORK_ERROR',
        message: 'Server not reachable. Please try again.',
        isNetworkError: true,
      },
    });
  });
});
