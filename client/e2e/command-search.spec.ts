import { expect, test } from '@playwright/test';

const user = { _id: '111111111111111111111111', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', role: { name: 'Reader', permissions: ['lead:read', 'users:read', 'users:write'] } };

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([
    { name: 'updata-locale', value: 'en', url: baseURL! },
    { name: 'mb_refresh_token', value: 'search-fixture', url: baseURL! },
  ]);
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'search-fixture', refreshToken: 'search-fixture' };
    else if (path === '/users/me' || path === `/users/${user._id}`) data = user;
    else if (path === '/users' && url.searchParams.get('search') === 'engine') data = [user];
    else if (path === '/crm/leads' && url.searchParams.get('q') === 'engine') data = [{ _id: '222222222222222222222222', name: 'Analytical Engines', email: 'sales@engines.test' }];
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': baseURL!, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' }, body: JSON.stringify({ success: true, data, pagination: { hasNext: false, nextCursor: null, limit: 5 } }) });
  });
  await page.goto('/profile');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Search', exact: true })).toBeVisible({ timeout: 60_000 });
});

test('close, clear, shortcut reset, keyboard navigation and responsive layout', async ({ page }, testInfo) => {
  const trigger = page.getByRole('banner').getByRole('button', { name: 'Search', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await input.fill('zzzzzz');
  await expect(dialog.getByText('No results', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await page.screenshot({ path: `/tmp/updata-command-search-${testInfo.project.name}.png` });
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(642);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await input.fill('leads');
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(input).toHaveValue('');
  await input.fill('profile');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('uses correct API parameters and keeps server matches visible', async ({ page }) => {
  await page.getByRole('banner').getByRole('button', { name: 'Search', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const usersRequest = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/users') && new URL(request.url()).searchParams.get('search') === 'engine');
  const leadsRequest = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/crm/leads') && new URL(request.url()).searchParams.get('q') === 'engine');
  await dialog.getByRole('combobox').fill('engine');
  await Promise.all([usersRequest, leadsRequest]);
  await expect(dialog.getByRole('option', { name: /Ada Lovelace/ })).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Analytical Engines/ })).toBeVisible();
  await dialog.getByRole('option', { name: /Ada Lovelace/ }).click();
  await expect(page).toHaveURL(new RegExp(`/settings/users/${user._id}$`), { timeout: 60_000 });
});

test('new user action opens the creation form', async ({ page }) => {
  await page.getByRole('banner').getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').fill('create user');
  await page.getByRole('option').click();
  await expect(page).toHaveURL(/\/settings\/users/);
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
  await expect(page.locator('[data-slot="dialog-content"] input[name="firstName"]')).toBeVisible();
});

test('theme action resets search and failed requests can be retried', async ({ page }, testInfo) => {
  const trigger = page.getByRole('banner').getByRole('button', { name: 'Search', exact: true });
  await trigger.click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').fill('theme');
  await dialog.getByRole('option').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await trigger.click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox')).toHaveValue('');
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({ path: `/tmp/updata-command-search-dark-${testInfo.project.name}.png` });
  let fail = true;
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (fail && (url.searchParams.get('search') === 'unavailable' || url.searchParams.get('q') === 'unavailable')) {
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: false, message: 'Unavailable' }) });
    } else await route.fallback();
  });
  await dialog.getByRole('combobox').fill('unavailable');
  await expect(dialog.getByText('Some records could not be loaded. Please try again.')).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByText('No results', { exact: false })).toBeVisible();
});
