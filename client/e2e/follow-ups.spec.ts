import { expect, test } from '@playwright/test';

test('follow-up inbox schedules, searches, filters and adapts to the viewport', async ({ page, baseURL, isMobile }, testInfo) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies([
    { name: 'updata-locale', value: 'en', url: baseURL! },
    { name: 'mb_refresh_token', value: 'follow-up-fixture', url: baseURL! },
  ]);
  let scheduled: Record<string, unknown> | null = null;
  const requests: URL[] = [];
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'follow-up-fixture', refreshToken: 'follow-up-fixture' };
    else if (path === '/users/me') data = { _id: 'u-me', firstName: 'Sales', lastName: 'Agent', role: { name: 'Agent', permissions: ['lead:read', 'lead:write'] } };
    else if (path === '/crm/leads') data = [{ id: 'l1', _id: 'l1', name: 'Acme AG', leadNumber: 'L-001', status: 'new' }];
    else if (path === '/crm/follow-ups/summary') data = { overdue: 0, today: 0, upcoming: scheduled ? 1 : 0, done: 0 };
    else if (path === '/crm/follow-ups' && req.method() === 'POST') { scheduled = req.postDataJSON(); data = { id: 'f1', leadId: 'l1' }; }
    else if (path === '/crm/follow-ups') {
      requests.push(url);
      data = scheduled && !url.searchParams.has('q') && (!url.searchParams.has('channel') || url.searchParams.get('channel') === 'phone') ? [{ id: 'f1', leadId: 'l1', lead: { id: 'l1', name: 'Acme AG', leadNumber: 'L-001' }, owner: { id: 'u-me', name: 'Sales Agent' }, channel: 'phone', status: 'open', bucket: 'upcoming', dueAt: scheduled.dueAt, nextDueAt: scheduled.dueAt, timezone: scheduled.timezone, note: scheduled.note, source: { type: 'manual' } }] : [];
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': baseURL!, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, OPTIONS' }, body: JSON.stringify({ success: true, data, pagination: { hasNext: false, nextCursor: null } }) });
  });
  await page.goto('/leads/follow-ups');
  await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
  await page.screenshot({ path: `/tmp/updata-follow-ups-empty-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'New follow-up', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Schedule follow-up', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: /Acme AG/ }).click();
  await dialog.getByLabel('Date and time', { exact: true }).fill('2099-11-03T09:30');
  await dialog.getByLabel('Notes (optional)').fill('Discuss the proposal');
  await dialog.getByRole('button', { name: 'Schedule follow-up', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Upcoming/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: 'Acme AG', exact: true })).toBeVisible();
  expect(scheduled).toMatchObject({ leadId: 'l1', channel: 'phone', note: 'Discuss the proposal' });
  expect(scheduled).toHaveProperty('timezone');
  await page.screenshot({ path: `/tmp/updata-follow-ups-populated-${testInfo.project.name}.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('tab', { name: /Today/ })).toHaveCSS('background-color', 'rgb(18, 26, 42)');
  await expect(page.getByRole('heading', { name: 'Follow-ups', exact: true })).toHaveCSS('color', 'rgb(232, 236, 245)');
  await page.screenshot({ path: `/tmp/updata-follow-ups-dark-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('searchbox', { name: 'Search follow-ups' }).fill('unmatched');
  await expect(page.getByRole('heading', { name: 'No matching follow-ups' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Acme AG', exact: true })).toBeVisible();
  await page.getByLabel('Channel', { exact: true }).selectOption('email');
  await expect.poll(() => requests.at(-1)?.searchParams.get('channel')).toBe('email');
  await expect(page.getByRole('heading', { name: 'No matching follow-ups' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect(errors).toEqual([]);
});
