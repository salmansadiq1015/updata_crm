import { expect, test, type Page } from '@playwright/test';

const taskId = '507f1f77bcf86cd799439013';
const listId = '507f1f77bcf86cd799439012';
const user = { _id: '507f1f77bcf86cd799439011', firstName: 'Salman', lastName: 'Admin', role: { name: 'Admin', permissions: [] } };
const roomId = '507f1f77bcf86cd799439014';
const task = { _id: taskId, title: 'Salman Task', listId, status: 'OPEN', priority: 'NONE', assigneeId: user._id, assigneeIds: [user._id], createdBy: user._id, createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z', version: 1 };
const room = { _id: roomId, roomType: 'TASK', name: task.title, members: [{ userId: user }], createdBy: user._id, isActive: true };

async function prepare(page: Page, state: { fail: boolean; empty?: boolean }) {
  const requests: string[] = [];
  const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'chat-fixture', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data: unknown = [];
    if (path.startsWith('/chat/') || path.endsWith('/chat')) requests.push(path);
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = user;
    else if (path === '/task-lists') data = [{ _id: listId, name: 'My tasks', openTaskCount: 1 }];
    else if (path === '/task-folders') data = { folders: [] };
    else if (path === `/tasks/${taskId}`) data = task;
    else if (path === `/tasks/${taskId}/chat`) {
      if (state.fail) return route.fulfill({ status: 503, headers, json: { success: false, message: 'Conversation temporarily unavailable' } });
      data = state.empty ? {} : { roomId, roomType: 'TASK', room };
    } else if (path === `/chat/rooms/${roomId}`) data = room;
    else if (path === `/chat/rooms/${roomId}/messages`) data = [{ _id: 'message-a', senderId: user._id, content: 'Ready for review', senderName: 'Salman Admin', messageType: 'TEXT', sentAt: '2026-11-09T00:00:00Z', readBy: [] }];
    await route.fulfill({ headers, json: { success: true, data, pagination: { hasNext: false, nextCursor: null, limit: 50 } } });
  });
  await page.goto(`/tasks/${listId}/${taskId}`);
  await expect(page.getByTestId('task-detail').getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  requests.length = 0;
  return requests;
}

test('task chat recovers from API failure and reuses resolved room details', async ({ page }) => {
  const state = { fail: true };
  const requests = await prepare(page, state);
  const openChat = () => page.getByTestId('task-detail').getByRole('button', { name: 'Chat', exact: true }).click();
  await openChat();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(requests.filter(path => path === `/tasks/${taskId}/chat`)).toHaveLength(1);
  state.fail = false;
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByText('Ready for review', { exact: true })).toBeVisible();
  expect(requests.filter(path => path === `/chat/rooms/${roomId}`)).toHaveLength(0);
  expect(requests.filter(path => path === '/chat/rooms')).toHaveLength(0);
  await page.keyboard.press('Escape');
  await openChat();
  await expect(dialog.getByText('Ready for review', { exact: true })).toBeVisible();
  expect(requests.filter(path => path === `/tasks/${taskId}/chat`)).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('an empty resolver response shows a retry action instead of an endless spinner', async ({ page }) => {
  await prepare(page, { fail: false, empty: true });
  await page.getByTestId('task-detail').getByRole('button', { name: 'Chat', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
});
