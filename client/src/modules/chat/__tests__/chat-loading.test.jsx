import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useChatMessages } from '../hooks/use-chat-messages';
import { chatService } from '../services/chat-service';
import { queryKeys } from '@/lib/query/keys';
const fixture = vi.hoisted(() => ({ router: { push: vi.fn() }, socket: { connected: true, emit: vi.fn(), on: vi.fn(), off: vi.fn() }, connect: null }));
vi.mock('next/navigation', () => ({ useRouter: () => fixture.router }));
vi.mock('@/shared/hooks/use-auth', () => ({ useAuth: () => ({ user: { _id: 'reader' } }) }));
vi.mock('../services/chat-service', () => ({ chatService: { listMessages: vi.fn() } }));
vi.mock('@/lib/socket/client', () => ({
  getSocket: () => fixture.socket,
  onSocketConnect: callback => { fixture.connect = callback; if (fixture.socket.connected) callback(fixture.socket); return vi.fn(); },
}));
const clients = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useChatMessages('room-a'), { wrapper }), client };
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.socket.connected = true;
  chatService.listMessages.mockResolvedValue([{ _id: 'one', sentAt: '2026-11-09T00:00:00Z' }]);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); });

test('joining a socket does not duplicate the initial message request', async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(chatService.listMessages).toHaveBeenCalledTimes(1);
  expect(chatService.listMessages.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
});

test('reconnecting refreshes messages and retains previously loaded history', async () => {
  const { result, client } = mount();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  client.setQueryData(queryKeys.chat.messages('room-a'), [{ _id: 'old', sentAt: '2026-11-08T00:00:00Z' }]);
  await act(async () => fixture.connect(fixture.socket));
  await waitFor(() => expect(chatService.listMessages).toHaveBeenCalledTimes(2));
  expect(client.getQueryData(queryKeys.chat.messages('room-a')).map(message => message._id)).toEqual(['old', 'one']);
});

test('connected chats use a 60-second safety refresh instead of 15-second polling', async () => {
  vi.useFakeTimers();
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  expect(chatService.listMessages).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(chatService.listMessages).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
  expect(chatService.listMessages).toHaveBeenCalledTimes(2);
});

test('disconnected chats retain the 15-second polling fallback', async () => {
  vi.useFakeTimers(); fixture.socket.connected = false;
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(20); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(chatService.listMessages).toHaveBeenCalledTimes(2);
});

test('message and read notifications do not refetch room details', async () => {
  const { result, client } = mount();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const handler = name => fixture.socket.on.mock.calls.find(([event]) => event === name)[1];
  await act(async () => {
    handler('chat:new_message')({ roomId: 'room-a', message: { _id: 'two', sentAt: '2026-11-09T01:00:00Z' } });
    handler('chat:read')({ roomId: 'room-a', userId: 'reader' });
    handler('chat:room_updated')({ roomId: 'room-a', lastMessageAt: '2026-11-09T01:00:00Z' });
  });
  expect(invalidate.mock.calls.some(([filter]) => JSON.stringify(filter.queryKey) === JSON.stringify(queryKeys.chat.room('room-a')))).toBe(false);
  await act(async () => handler('chat:room_updated')({ roomId: 'room-a' }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.chat.room('room-a') });
});
