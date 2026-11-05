import { test, expect, type Page } from '@playwright/test';
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const user = { _id: '690000000000000000000001', firstName: 'Salman', lastName: 'Admin', email: 'salman@example.com', role: { name: 'Admin', permissions: [] } };
const leads = [
  { _id: '690000000000000000000011', name: 'Northwind Studio', leadNumber: 'L-101', type: 'business', status: 'qualified', email: 'northwind@example.com', phone: '+41791234567', source: 'manual' },
  { _id: '690000000000000000000012', name: 'Contoso Design', leadNumber: 'L-102', type: 'business', status: 'new', email: 'contoso@example.com', phone: '+41791234568', source: 'manual' },
];
const roomId = '690000000000000000000021';
const initialRoom = { _id: roomId, roomType: 'LEAD', name: 'Enterprise accounts', leadIds: leads, members: [{ userId: user }], admins: [user._id], createdBy: user._id, __v: 0, isActive: true, lastMessageAt: '2026-11-05T12:00:00Z', lastMessageText: 'The proposals are ready for review.', unreadCount: 2 };
async function prepare(page: Page, options: { empty?: boolean; failSend?: boolean; locale?: string; readOnly?: boolean } = {}) {
  let room = { ...initialRoom };
  const directory = [...leads];
  let rooms = options.empty ? [] : [room];
  let attempts = 0;
  const sent: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
  let messages = [{ _id: '690000000000000000000031', roomId, senderId: user._id, senderName: 'Salman Admin', messageType: 'TEXT', content: 'The proposals are ready for review.', sentAt: '2026-11-05T12:00:00Z', reactions: [], readBy: [] }];
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'chat-fixture', url: origin }, { name: 'updata-locale', value: options.locale || 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = options.readOnly ? { ...user, role: { name: 'Viewer', permissions: ['chat:read', 'lead:read'] } } : user;
    else if (path === '/users/directory') data = [user];
    else if (path === '/chat/rooms') data = rooms;
    else if (path === '/chat/rooms/leads') { const input = request.postDataJSON(); created.push(input); room = { ...room, name: input.name, leadIds: directory.filter(lead => input.leadIds.includes(lead._id)) }; rooms = [room]; data = room; }
    else if (path === `/chat/rooms/${roomId}`) data = room;
    else if (path === `/chat/rooms/${roomId}/leads`) { const input = request.postDataJSON(); room = { ...room, ...input, leadIds: directory.filter(lead => input.leadIds.includes(lead._id)), __v: room.__v + 1 }; rooms = [room]; data = room; }
    else if (path === `/chat/rooms/${roomId}/messages` && request.method() === 'POST') {
      const input = request.postDataJSON(); sent.push(input); attempts++;
      if (options.failSend && attempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Temporary delivery failure' }) });
      const message = { ...messages[0], ...input, _id: '690000000000000000000032', sentAt: new Date().toISOString() }; messages = [...messages, message]; data = message;
    }
    else if (path === `/chat/rooms/${roomId}/messages`) data = messages;
    else if (path === `/chat/rooms/${roomId}/summary`) data = { summary: 'Next step: review the proposals.', messageCount: 1 };
    else if (path === '/crm/leads' && request.method() === 'POST') { const lead = { ...leads[0], ...request.postDataJSON(), _id: '690000000000000000000013', leadNumber: 'L-103' }; directory.push(lead); data = lead; }
    else if (path === '/crm/leads') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: directory, pagination: { total: 2, page: 1, limit: 30 } }) });
    else if (/\/crm\/leads\/[^/]+\/timeline/.test(path)) data = { items: [], pagination: { hasNext: false, nextCursor: null } };
    else if (/\/crm\/leads\/[^/]+$/.test(path)) data = directory.find(lead => path.endsWith(lead._id));
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin }, body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/field-ops/chat');
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByRole('heading', { name: options.locale === 'ar' ? 'الدردشات' : 'Chats', exact: true })).toBeVisible();
  return { sent, created };
}

test('creates one or multiple lead conversations and opens the team chat', async ({ page }) => {
  const { created } = await prepare(page, { empty: true });
  await page.getByRole('button', { name: 'New lead conversation', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Conversation name' }).fill('Enterprise opportunities');
  await dialog.getByRole('checkbox', { name: /Northwind Studio/ }).check();
  await dialog.getByRole('checkbox', { name: /Contoso Design/ }).check();
  await dialog.getByRole('button', { name: 'Start conversation' }).click();
  await expect(page.getByRole('tab', { name: 'Team chat' })).toBeVisible();
  expect(created[0].leadIds).toEqual(leads.map(lead => lead._id));
  await expect(page.getByRole('textbox', { name: 'Type a message...' })).toBeVisible();
});

test('failed delivery preserves draft, retries safely, and summary is functional', async ({ page }, info) => {
  const { sent } = await prepare(page, { failSend: true });
  await page.getByRole('button', { name: /Enterprise accounts/ }).click();
  const input = page.getByRole('textbox', { name: 'Type a message...' });
  await input.fill('Please review both proposals.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your draft is saved' })).toBeVisible();
  await expect(input).toHaveValue('Please review both proposals.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(input).toHaveValue('');
  expect(sent[0].clientMessageId).toBe(sent[1].clientMessageId);
  await page.getByRole('button', { name: 'Ask AI for summary' }).click();
  await expect(page.getByRole('dialog').getByText('Next step: review the proposals.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `/private/tmp/updata-chat-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('external messages have explicit recipients, channels, history and the real outreach composer', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: /Enterprise accounts/ }).click();
  await page.getByRole('tab', { name: 'Lead messages', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Contact linked leads' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Contoso Design' }).uncheck();
  await expect(page.getByRole('button', { name: 'Compose message (1)' })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Channel', exact: true }).click();
  await page.getByRole('option', { name: 'SMS', exact: true }).click();
  await page.getByRole('button', { name: 'Compose message (1)' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const composer = page.getByRole('dialog');
  await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Your proposal is ready for review.');
  await composer.getByRole('button', { name: 'Recipients', exact: true }).click();
  await expect(composer.getByText('Northwind Studio', { exact: true }).first()).toBeVisible();
  await expect(composer.getByText('Contoso Design', { exact: true })).toHaveCount(0);
});

test('details can edit lead links on every viewport and mobile returns to the conversation list', async ({ page }, info) => {
  await prepare(page); await page.getByRole('button', { name: /Enterprise accounts/ }).click();
  await page.getByRole('button', { name: 'Conversation details' }).click();
  await page.getByRole('button', { name: 'Manage leads' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Manage leads' }) });
  await dialog.getByRole('button', { name: 'Remove lead: Contoso Design' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Lead messages' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  if (info.project.name.includes('mobile')) { await page.getByRole('link', { name: 'Back', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible(); }
});

test('read-only chat hides write and outreach actions', async ({ page }) => {
  await prepare(page, { readOnly: true });
  await expect(page.getByRole('button', { name: 'New lead conversation', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Enterprise accounts/ }).click();
  await expect(page.getByRole('textbox', { name: 'Type a message...' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Lead messages' }).click();
  await expect(page.getByRole('button', { name: 'Compose message (2)' })).toBeDisabled();
});

test('Arabic lead chat stays inside the viewport and preserves RTL direction', async ({ page }, info) => {
  await prepare(page, { locale: 'ar' });
  await page.getByRole('button', { name: /Enterprise accounts/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('tab', { name: 'رسائل العملاء المحتملين', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'التواصل مع العملاء المرتبطين' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/private/tmp/updata-chat-arabic-${info.project.name}.png`, fullPage: true });
});

test('creates a CRM lead from chat and links it as a single-lead conversation', async ({ page }) => {
  const { created } = await prepare(page, { empty: true });
  await page.getByRole('button', { name: 'New lead conversation', exact: true }).first().click();
  await page.getByRole('button', { name: 'Create lead', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('textbox', { name: 'Name', exact: false }).first().fill('Meridian Workshop');
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill('meridian@example.com');
  await form.getByRole('button', { name: 'Create lead', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New lead conversation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Lead messages', exact: true })).toBeVisible();
  expect(created[0].leadIds).toEqual(['690000000000000000000013']);
});
