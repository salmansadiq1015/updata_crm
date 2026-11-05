import { expect, test, type Page } from '@playwright/test';
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const id = '507f1f77bcf86cd799439011';
async function prepare(page: Page, mode = 'populated') {
  const today = new Date().toISOString().slice(0, 10);
  const calls: { path: string; method: string; body: any; query: string }[] = [];
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'fixture', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname.replace('/api/v1', '');
    let body: any; try { body = req.postDataJSON(); } catch { body = req.postData(); }
    calls.push({ path, method: req.method(), body, query: url.search });
    let data: any = [];
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: 'bank-user', firstName: 'Salman', lastName: 'Admin', role: { name: mode === 'restricted' ? 'Reader' : 'Admin', permissions: mode === 'restricted' ? ['accounting:bank:read'] : [] } };
    else if (path === '/accounting/bank/analytics') {
      if (mode === 'error') { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable' }) }); return; }
      data = { currency: 'CHF', totals: { count: mode === 'empty' ? 0 : 18, inflows: 42000, outflows: 18500, net: 23500, unmatched: 3 }, daily: [{ date: today, inflows: 42000, outflows: 18500, count: 18, net: 23500 }], statuses: [{ status: 'UNMATCHED', count: 3 }, { status: 'AUTO_MATCHED', count: 12 }, { status: 'CATEGORIZED', count: 3 }], counterparties: [{ name: 'Alpine Studio AG', inflows: 0, outflows: 18500 }] };
    } else if (path === '/accounting/bank' && req.method() === 'GET') data = mode === 'empty' ? [] : [{ _id: id, name: 'Operating account', bankName: 'UBS Switzerland', iban: 'CH9300762011623852957', currency: 'CHF', currentBalance: 128450.75, connectionType: 'MANUAL', status: 'ACTIVE', categoryRules: [] }];
    else if (path === '/accounting/bank/transactions') data = [{ _id: 'tx-1', transactionDate: today, valueDate: today, amount: -12.5, currency: 'CHF', bookingText: 'Monthly bank fee', reference: 'FEE-001', reconciliationStatus: 'UNMATCHED' }];
    else if (path === '/accounting/bank/import') data = { status: mode === 'duplicate' ? 'duplicate' : 'imported', transactionCount: mode === 'duplicate' ? 0 : 1, statementId: 'CSV-test' };
    else if (path === '/accounting/accounts') data = [{ _id: '507f1f77bcf86cd799439012', accountNumber: '6940', name: 'Bank charges', isActive: true }];
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id' }, body: JSON.stringify({ success: true, data, pagination: { hasNext: false } }) });
  });
  await page.goto('/accounting/bank');
  await expect(page.getByRole('heading', { name: 'Banking', exact: true })).toBeVisible({ timeout: 60000 });
  return { calls, today };
}
test('banking overview, heat map drilldown, filters and responsive account cards', async ({ page }, info) => {
  const { calls, today } = await prepare(page);
  await expect(page.getByRole('heading', { name: 'Cash flow over time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cash activity heat map' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '83');
  if (info.project.name === 'desktop-chromium') await page.setViewportSize({ width: 1440, height: 1500 });
  await page.screenshot({ path: `/private/tmp/banking-after-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('combobox', { name: 'Analysis currency' }).click();
  await page.getByRole('option', { name: /^EUR\b/ }).click();
  await expect.poll(() => calls.some(c => c.path.endsWith('/analytics') && c.query.includes('currency=EUR'))).toBe(true);
  await page.getByRole('button', { name: new RegExp(`${today}: 18 transactions`) }).click();
  await expect(page.getByText('Monthly bank fee', { exact: true })).toBeVisible();
  await expect.poll(() => calls.some(c => c.path.endsWith('/transactions') && c.query.includes('transactionDateFrom='))).toBe(true);
  await page.getByRole('button', { name: 'Clear date filter' }).click();
  await page.getByRole('tab', { name: /^Accounts/ }).click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
test('CSV import submits selected account and reports its outcome', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.getByRole('button', { name: 'Import statement', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Operating account' }).click();
  await dialog.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: 'CSV', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'Download CSV template' })).toBeVisible();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'statement.csv', mimeType: 'text/csv', buffer: Buffer.from('date,amount,currency,description\n2026-11-01,-12.50,CHF,Bank fee\n') });
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('1 transactions imported');
  expect(calls.some(c => c.path.endsWith('/bank/import') && String(c.body).includes(id) && String(c.body).includes('csv'))).toBe(true);
});
test('automation persists gateway settings and category rules', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.getByRole('tab', { name: 'Automation', exact: true }).click();
  await page.getByRole('combobox', { name: 'Delivery method', exact: true }).click();
  await page.getByRole('option', { name: 'SFTP gateway', exact: true }).click();
  await page.getByLabel('Server inbox directory').fill('/bank/inbox');
  await page.getByLabel('Enable scheduled retrieval').check();
  await page.getByRole('button', { name: 'Rule', exact: true }).click();
  await page.getByLabel('Rule 1 keyword').fill('monthly fee');
  await page.getByRole('combobox', { name: 'Rule 1 ledger account', exact: true }).click();
  await page.getByRole('option', { name: '6940 · Bank charges', exact: true }).click();
  await page.getByRole('button', { name: 'Save automation' }).click();
  await expect.poll(() => calls.find(c => c.method === 'PUT' && c.path === `/accounting/bank/${id}`)?.body).toMatchObject({ connectionType: 'SFTP', autoRetrieveEnabled: true, connectionConfig: { statementDirectory: '/bank/inbox' }, categoryRules: [{ keyword: 'monthly fee', direction: 'OUT', accountId: '507f1f77bcf86cd799439012' }] });
});
test('empty analytics invite import without synthetic chart data', async ({ page }) => {
  await prepare(page, 'empty');
  await expect(page.getByText('Your cash flow starts here')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import statement', exact: true })).toBeDisabled();
});
test('readers do not see bank management controls', async ({ page }) => {
  await prepare(page, 'restricted');
  await expect(page.getByRole('button', { name: 'Add account', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import statement', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Accounts/ }).click();
  await expect(page.getByRole('button', { name: 'pain.002', exact: true })).toHaveCount(0);
});

test('analytics failure presents a retry instead of zero balances', async ({ page }) => {
  await prepare(page, 'error');
  await expect(page.getByRole('alert').filter({ hasText: 'Banking analytics could not be loaded.' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('banking tabs and dropdowns support keyboard navigation and styled menus', async ({ page }, info) => {
  await prepare(page);
  const tabs = page.getByRole('tablist', { name: 'Banking workspaces' });
  await tabs.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Automation', exact: true })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Automation', exact: true })).toHaveAttribute('data-state', 'active');
  await page.getByRole('combobox', { name: 'Automation account', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Operating account', exact: true })).toBeVisible();
  await page.screenshot({ path: `/private/tmp/banking-account-menu-${info.project.name}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Automation account', exact: true })).toBeFocused();
  await tabs.getByRole('tab', { name: 'Overview', exact: true }).click();
  const period = page.getByRole('combobox', { name: 'Analysis period', exact: true });
  await period.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: '180 days', exact: true })).toBeVisible();
  await page.screenshot({ path: `/private/tmp/banking-period-menu-${info.project.name}.png`, fullPage: true });
  await page.getByRole('option', { name: '180 days', exact: true }).click();
  await expect(period).toContainText('180 days');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('global currency searches international codes and survives navigation and reload', async ({ page }) => {
  const { calls } = await prepare(page);
  await page.getByRole('combobox', { name: 'Global currency', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search currencies', exact: true }).fill('PKR');
  await page.getByRole('option', { name: /^PKR\b/ }).click();
  await expect(page.getByRole('combobox', { name: 'Analysis currency', exact: true })).toContainText('PKR');
  await expect.poll(() => calls.some(c => c.path.endsWith('/analytics') && c.query.includes('currency=PKR'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Global currency', exact: true })).toContainText('PKR');
  await page.goto('/accounting/cash');
  await expect(page.getByRole('combobox', { name: 'Forecast currency', exact: true })).toContainText('PKR');
  await expect.poll(() => calls.some(c => c.path.endsWith('/cash/forecast') && c.query.includes('currency=PKR'))).toBe(true);
  await page.goto('/accounting/reports');
  await expect(page.getByRole('combobox', { name: 'Report currency', exact: true })).toContainText('PKR');
});
