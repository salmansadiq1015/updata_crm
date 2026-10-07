import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks: the CRM service + the browser↔extension bridge ──────────────────────
const getStatus = vi.fn();
const createPairing = vi.fn();
const disconnectApi = vi.fn();
const canMessageExtension = vi.fn();
const pingExtension = vi.fn();
const connectExtension = vi.fn();
const disconnectExtension = vi.fn();

vi.mock('../services/extension-api', () => ({
  extensionApi: {
    getStatus: (...args: unknown[]) => getStatus(...args),
    createPairing: (...args: unknown[]) => createPairing(...args),
    disconnect: (...args: unknown[]) => disconnectApi(...args),
  },
}));

vi.mock('../hooks/chrome-extension-bridge', () => ({
  canMessageExtension: (...args: unknown[]) => canMessageExtension(...args),
  pingExtension: (...args: unknown[]) => pingExtension(...args),
  connectExtension: (...args: unknown[]) => connectExtension(...args),
  disconnectExtension: (...args: unknown[]) => disconnectExtension(...args),
}));

vi.mock('@/lib/api/client', () => ({
  default: { defaults: { baseURL: 'https://updata.behjja.com/api/v1' } },
}));

import { useExtensionConnection } from '../hooks/use-extension-connection';

const EXT_ID = 'bnmjibohjdkkibimeknikhnolhlbgmnk';
const serverStatus = (over: Record<string, unknown> = {}) => ({
  connected: false,
  extensionId: EXT_ID,
  connection: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  canMessageExtension.mockReturnValue(true);
  getStatus.mockResolvedValue(serverStatus());
  pingExtension.mockResolvedValue({ installed: false, connected: false });
});

afterEach(() => vi.clearAllMocks());

describe('useExtensionConnection state machine', () => {
  it('reports "unsupported" when the browser cannot message extensions', async () => {
    canMessageExtension.mockReturnValue(false);
    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('unsupported'));
  });

  it('reports "not-installed" when the ping finds no extension', async () => {
    pingExtension.mockResolvedValue({ installed: false, connected: false });
    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('not-installed'));
  });

  it('reports "installed-not-connected" when present but the server has no link', async () => {
    pingExtension.mockResolvedValue({ installed: true, connected: false });
    getStatus.mockResolvedValue(serverStatus({ connected: false }));
    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('installed-not-connected'));
  });

  it('reports "connected" only when the server confirms a live link', async () => {
    pingExtension.mockResolvedValue({ installed: true, connected: true });
    getStatus.mockResolvedValue(serverStatus({ connected: true, connection: { id: 'c1', status: 'connected' } }));
    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('connected'));
  });

  it('reports "error" when the extension holds a token but the server session is gone', async () => {
    pingExtension.mockResolvedValue({ installed: true, connected: true });
    getStatus.mockResolvedValue(serverStatus({ connected: false, error: 'session_expired' }));
    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('error'));
  });

  it('does not probe at all until enabled', async () => {
    renderHook(() => useExtensionConnection(false));
    // Give any stray effects a tick.
    await act(async () => { await Promise.resolve(); });
    expect(getStatus).not.toHaveBeenCalled();
    expect(pingExtension).not.toHaveBeenCalled();
  });

  it('connect(): mints a grant, hands it to the extension, then confirms via the server', async () => {
    let linked = false;
    pingExtension.mockResolvedValue({ installed: true, connected: false });
    getStatus.mockImplementation(async () =>
      serverStatus(linked ? { connected: true, connection: { id: 'c1', status: 'connected' } } : { connected: false }),
    );
    createPairing.mockResolvedValue({ grant: 'a'.repeat(64), extensionId: EXT_ID, expiresInSec: 300 });
    connectExtension.mockImplementation(async () => { linked = true; return { ok: true }; });

    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('installed-not-connected'));

    await act(async () => { await result.current.connect(); });

    expect(createPairing).toHaveBeenCalledTimes(1);
    // The grant is passed to the extension with an absolute API base.
    expect(connectExtension).toHaveBeenCalledWith(EXT_ID, 'a'.repeat(64), 'https://updata.behjja.com/api/v1');
    await waitFor(() => expect(result.current.state).toBe('connected'));
  });

  it('connect(): surfaces an error when the extension cannot complete it', async () => {
    pingExtension.mockResolvedValue({ installed: true, connected: false });
    createPairing.mockResolvedValue({ grant: 'b'.repeat(64), extensionId: EXT_ID, expiresInSec: 300 });
    connectExtension.mockResolvedValue({ ok: false, error: 'The extension did not respond.' });

    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('installed-not-connected'));
    await act(async () => { await result.current.connect(); });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('The extension did not respond.');
  });

  it('disconnect(): revokes server-side and clears the extension, then re-checks', async () => {
    pingExtension.mockResolvedValue({ installed: true, connected: true });
    getStatus.mockResolvedValue(serverStatus({ connected: true, connection: { id: 'c9', status: 'connected' } }));
    disconnectApi.mockResolvedValue({ disconnected: 1 });

    const { result } = renderHook(() => useExtensionConnection(true));
    await waitFor(() => expect(result.current.state).toBe('connected'));

    // After disconnect the server reports no link and the extension reports none.
    getStatus.mockResolvedValue(serverStatus({ connected: false }));
    pingExtension.mockResolvedValue({ installed: true, connected: false });

    await act(async () => { await result.current.disconnect(); });

    expect(disconnectApi).toHaveBeenCalledWith('c9');
    expect(disconnectExtension).toHaveBeenCalledWith(EXT_ID);
    await waitFor(() => expect(result.current.state).toBe('installed-not-connected'));
  });
});
