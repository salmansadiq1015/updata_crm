import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketHandlers = new Map();
const mockDisconnect = vi.fn();
const mockSocket = {
  connected: false,
  disconnect: mockDisconnect,
  on: vi.fn((event, handler) => {
    socketHandlers.set(event, handler);
    return mockSocket;
  }),
};
const mockIo = vi.fn(() => mockSocket);

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

vi.mock('@/lib/api/config', () => ({
  resolveApiOrigin: () => 'http://localhost:9097',
}));

describe('socket client', () => {
  beforeEach(() => {
    vi.resetModules();
    socketHandlers.clear();
    mockDisconnect.mockClear();
    mockSocket.on.mockClear();
    mockIo.mockClear();
    mockSocket.connected = false;
  });

  it('connects with polling-first transport and websocket upgrade support', async () => {
    const { connectSocket } = await import('./client');

    connectSocket('access-token');

    expect(mockIo).toHaveBeenCalledWith('http://localhost:9097', expect.objectContaining({
      auth: { token: 'access-token' },
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      reconnectionAttempts: 10,
    }));
  });

  it('stops reconnecting when socket auth is rejected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { connectSocket } = await import('./client');

    connectSocket('expired-token');
    socketHandlers.get('connect_error')?.(new Error('Authentication failed'));

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Auth rejected'));

    warn.mockRestore();
  });

  it('does not report transient websocket fallback as an error', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { connectSocket } = await import('./client');

    connectSocket('access-token');
    socketHandlers.get('connect_error')?.({ message: 'websocket error', transport: 'websocket' });

    expect(debug).toHaveBeenCalledWith(expect.stringContaining('Transport fallback'), expect.any(Object));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Connection issue'), expect.anything());
    expect(error).not.toHaveBeenCalled();

    debug.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('uses the same resilient transport strategy for mobile sockets', async () => {
    const { getSocket } = await import('@/modules/mobile/lib/websocket-client');

    getSocket('mobile-token');

    expect(mockIo).toHaveBeenCalledWith('http://localhost:9097', expect.objectContaining({
      auth: { token: 'mobile-token' },
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
    }));
  });
});
