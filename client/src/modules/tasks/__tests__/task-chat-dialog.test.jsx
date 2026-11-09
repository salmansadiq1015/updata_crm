import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TaskChatDialog } from '../components/task-chat-dialog';
import { taskService } from '../services/task-service';
import { queryKeys } from '@/lib/query/keys';
vi.mock('../services/task-service', () => ({ taskService: { resolveChat: vi.fn() } }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (_key, fallback) => fallback }) }));
vi.mock('@/modules/chat/components/chat-panel', () => ({ ChatPanel: ({ roomId }) => <div>Conversation {roomId}</div> }));
const clients = [];
function mount(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  clients.push(client);
  const view = render(<QueryClientProvider client={client}><TaskChatDialog task={{ _id: 'task-a', title: 'Salman Task' }} open onOpenChange={vi.fn()} {...props} /></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
test('shows API errors instead of an endless spinner and allows retry', async () => {
  taskService.resolveChat.mockRejectedValueOnce({ statusCode: 403 }).mockResolvedValueOnce({ roomId: 'room-a' });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(taskService.resolveChat).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Conversation room-a')).toBeVisible();
});
test('rejects a successful response with no room instead of spinning forever', async () => {
  taskService.resolveChat.mockResolvedValue({});
  mount();
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
test('seeds room details and reuses the resolver cache when reopened', async () => {
  const room = { _id: 'room-a', members: [], name: 'Salman Task' };
  taskService.resolveChat.mockResolvedValue({ roomId: room._id, room });
  const { client, rerender } = mount();
  expect(await screen.findByText('Conversation room-a')).toBeVisible();
  expect(client.getQueryData(queryKeys.chat.room(room._id))).toEqual(room);
  const dialog = open => <QueryClientProvider client={client}><TaskChatDialog task={{ _id: 'task-a' }} open={open} onOpenChange={vi.fn()} /></QueryClientProvider>;
  rerender(dialog(false)); rerender(dialog(true));
  await waitFor(() => expect(screen.getByText('Conversation room-a')).toBeVisible());
  expect(taskService.resolveChat).toHaveBeenCalledTimes(1);
});
test('closed dialogs and missing tasks do not request a room', async () => {
  const view = mount({ open: false });
  expect(taskService.resolveChat).not.toHaveBeenCalled();
  view.unmount();
  mount({ task: null });
  expect(screen.getByRole('alert')).toBeVisible();
  expect(taskService.resolveChat).not.toHaveBeenCalled();
});
test('unmount cancels the pending resolver request', async () => {
  let signal;
  taskService.resolveChat.mockImplementation((_id, options) => { signal = options.signal; return new Promise(() => {}); });
  const view = mount();
  await waitFor(() => expect(taskService.resolveChat).toHaveBeenCalledOnce());
  view.unmount();
  expect(signal.aborted).toBe(true);
});

test('closing a mounted dialog cancels its pending resolver request', async () => {
  let signal;
  taskService.resolveChat.mockImplementation((_id, options) => { signal = options.signal; return new Promise(() => {}); });
  const { client, rerender } = mount();
  await waitFor(() => expect(taskService.resolveChat).toHaveBeenCalledOnce());
  rerender(<QueryClientProvider client={client}><TaskChatDialog task={{ _id: 'task-a' }} open={false} onOpenChange={vi.fn()} /></QueryClientProvider>);
  await waitFor(() => expect(signal.aborted).toBe(true));
});
