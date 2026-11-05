import { expect, test, type Page } from '@playwright/test';
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const user = { _id: '690000000000000000000001', firstName: 'Salman', lastName: 'Admin', email: 'salman@example.com', role: { name: 'Admin', permissions: [] } };
const accountId = '690000000000000000000011', secondId = '690000000000000000000012', messageId = '690000000000000000000021', draftId = '690000000000000000000022';
const accounts = [{ _id: accountId, ownerId: user._id, provider: 'google', address: 'sales@updata.example', status: 'connected', unreadCount: 2, signature: 'Salman\nCustomer Success', agentGrants: [] }, { _id: secondId, ownerId: user._id, provider: 'microsoft', address: 'support@updata.example', status: 'connected', unreadCount: 0, agentGrants: [] }];
const message = { _id: messageId, accountId, externalId: 'gmail-1', threadKey: 'conversation-1', from: 'Anna Keller <anna@customer.example>', to: ['sales@updata.example'], cc: ['team@customer.example'], subject: 'A proposal for the next chapter', text: 'Thanks for the conversation. Could you share the proposal and installation timeline?', snippet: 'Could you share the proposal and installation timeline?', date: '2026-11-05T12:00:00Z', state: 'received', folder: 'inbox', unread: true, unreadCount: 1, conversationCount: 1, starred: false, attachments: [], labels: [] };
async function prepare(page: Page, options: { empty?: boolean; saveError?: boolean; readOnly?: boolean } = {}) {
 const sent: any[] = [], drafts: any[] = [], bulk: any[] = [], filters: string[] = [];
 await page.addInitScript(() => localStorage.setItem('theme', 'light'));
 await page.context().addCookies([{ name: 'mb_refresh_token', value: 'email-test', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
 await page.route('**/api/v1/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/api/v1', ''); let data: any = [];
  if (path === '/auth/refresh') data = { accessToken: 'email-token', refreshToken: 'email-refresh' };
  else if (path === '/users/me') data = options.readOnly ? { ...user, role: { name: 'Viewer' }, permissions: ['email:read'] } : user;
  else if (path === '/email/accounts') data = options.empty ? [] : accounts;
  else if (path === '/email/agents') data = [{ _id: '690000000000000000000041', name: 'Sales concierge', availability: 'active' }];
  else if (path === '/email/messages') { filters.push(url.search); data = { items: options.empty || url.searchParams.get('accountId') === secondId ? [] : [message], nextCursor: null }; }
  else if (path === `/email/messages/${messageId}`) data = [message];
  else if (path === '/email/messages/bulk') { bulk.push(req.postDataJSON()); data = req.postDataJSON().ids.map((id: string) => ({ id, ok: true })); }
  else if (path === '/email/drafts' || path === `/email/drafts/${draftId}`) {
   drafts.push(req.postDataJSON());
   if (options.saveError) { options.saveError = false; return route.fulfill({ status: 503, contentType: 'application/json', json: { success: false, error: { message: 'Mail service is temporarily unavailable' } } }); }
   data = { ...req.postDataJSON(), _id: draftId, state: 'draft' };
  }
  else if (path === `/email/messages/${draftId}/send`) { sent.push(req.postDataJSON()); data = { state: 'queued' }; }
  else if (path.endsWith('/ai')) data = { text: 'Customer intent: review pricing. Next step: send the proposal.' };
  await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin }, json: { success: true, data } });
 });
 await page.goto('/email');
 await expect(page.getByRole('heading', { name: /^Email/ })).toBeVisible();
 return { sent, drafts, bulk, filters };
}
test('unified inbox opens a live thread and switches between accounts without overflow', async ({ page }, info) => {
 await prepare(page); await page.getByRole('button', { name: /Anna Keller.*A proposal/ }).click();
 await expect(page.getByText('Thanks for the conversation.', { exact: false })).toBeVisible();
 await expect(page.getByRole('button', { name: 'Reply', exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
 await page.screenshot({ path: `/private/tmp/updata-email-${info.project.name}.png`, fullPage: true });
 if (info.project.name.includes('mobile')) await page.getByRole('button', { name: 'Back to conversation list' }).click();
 const folderMenu = page.getByRole('button', { name: 'Open mail folders' });
 if (await folderMenu.isVisible()) await folderMenu.click();
 await page.getByRole('combobox', { name: 'Switch email account' }).selectOption(secondId);
 const closeFolders = page.getByRole('button', { name: 'Close folders' });
 if (await closeFolders.isVisible()) await closeFolders.click();
 await expect(page.getByText('A little breathing room')).toBeVisible();
});
test('reply-all retains customer recipients, failed save preserves body, and scheduled sending uses persisted draft', async ({ page }) => {
 const { drafts, sent } = await prepare(page, { saveError: true });
 await page.getByRole('button', { name: /Anna Keller.*A proposal/ }).click(); await page.getByRole('button', { name: 'Reply all', exact: true }).click();
 const dialog = page.getByRole('dialog');
 await expect(dialog.getByRole('textbox', { name: 'To recipients', exact: true })).toHaveValue('anna@customer.example, team@customer.example');
 await dialog.getByRole('textbox', { name: 'Email message body' }).fill('The proposal will be ready tomorrow.');
 await dialog.getByRole('button', { name: 'Save draft', exact: true }).click();
 await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
 await expect(dialog.getByRole('textbox', { name: 'Email message body' })).toContainText('The proposal will be ready tomorrow.');
 await dialog.getByLabel('Scheduled sending time').fill('2026-12-10T10:30');
 await dialog.getByRole('button', { name: 'Schedule email', exact: true }).click();
 await expect(dialog).toHaveCount(0); expect(drafts).toHaveLength(2); expect(drafts[1].replyToId).toBe(messageId); expect(drafts[1].scheduledAt).toBeTruthy(); expect(drafts[1].text).toContain('ready tomorrow'); expect(sent).toHaveLength(1);
});
test('empty inbox connects providers and read-only roles cannot compose', async ({ page }) => {
 await prepare(page, { empty: true }); await page.getByRole('button', { name: /Connect your first account/ }).click();
 const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('button', { name: /Google.*Workspace/ })).toBeVisible(); await expect(dialog.getByRole('button', { name: /Microsoft.*365/ })).toBeVisible();
 await dialog.getByRole('button', { name: /Other email provider/ }).click(); await expect(dialog.getByLabel('App password')).toBeVisible();
});

test('mailbox viewers can read but cannot compose or connect accounts', async ({ page }) => {
 await prepare(page, { readOnly: true });
 const menu = page.getByRole('button', { name: 'Open mail folders' }); if (await menu.isVisible()) await menu.click();
 await expect(page.getByRole('button', { name: 'Compose C', exact: true })).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Connect account', exact: true })).toHaveCount(0);
});
