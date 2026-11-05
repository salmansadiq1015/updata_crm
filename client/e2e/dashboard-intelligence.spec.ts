import { expect, test, type Page } from '@playwright/test';

const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const trend = Array.from({ length: 7 }, (_, index) => ({ key: `2026-11-0${index + 1}`, label: `Nov ${index + 1}`, total: 8 + index * 3, answered: 5 + index, completed: 4 + index, qualified: 2 + index, failed: index % 2, missed: 2, converted: 1 }));
const intelligence = {
  assistant: { available: true, metrics: { total: 84, completed: 72, failed: 3, awaiting: 4, active: 5 }, trend, breakdown: [{ id: 'COMPLETED', value: 72 }, { id: 'AWAITING_CONFIRMATION', value: 4 }, { id: 'FAILED', value: 3 }] },
  calling: { available: true, metrics: { total: 216, answered: 162, qualified: 48, completed: 150, failed: 8 }, inventory: { agents: 6, activeAgents: 4, activeCampaigns: 3 }, trend, breakdown: [{ id: 'completed', value: 150 }, { id: 'no_answer', value: 54 }, { id: 'failed', value: 8 }] },
  incoming: { available: true, scope: 'personal', metrics: { total: 98, answered: 89, missed: 9, aiHandled: 67, transferred: 12, qualified: 24 }, inventory: { live: 2 }, trend, breakdown: [{ id: 'COMPLETED', value: 89 }, { id: 'MISSED', value: 9 }] },
  leads: { available: true, metrics: { total: 142, qualified: 48, converted: 18 }, inventory: { total: 320, overdueFollowUps: 7 }, trend, breakdown: [{ id: 'new', value: 76 }, { id: 'qualified', value: 48 }, { id: 'converted', value: 18 }], pipeline: [{ id: 'new', value: 220 }, { id: 'qualified', value: 82 }, { id: 'converted', value: 18 }] },
};
const business = {
  updatedAt: '2026-11-05T12:00:00Z',
  overview: {
    kpis: [{ id: 'revenue', value: 128400, delta: 12.4, format: 'currency' }, { id: 'customers', value: 128, delta: 8.2 }, { id: 'projects', value: 24, delta: 4.1 }, { id: 'openTasks', value: 35, delta: -6 }, { id: 'scheduleToday', value: 12, delta: 0 }, { id: 'outstanding', value: 77242, delta: -3, format: 'currency' }],
    financialTrend: trend.map((item, i) => ({ ...item, revenue: 8000 + i * 3000, quoteValue: 16000 + (i % 3) * 6000, orderValue: 12000 + i * 1800 })),
    operationsTrend: trend.map((item, i) => ({ ...item, created: 5 + i, assignments: 4 + i % 3 })),
    featureMix: [{ id: 'crm', value: 128 }, { id: 'projects', value: 24 }, { id: 'tasks', value: 35 }, { id: 'scheduling', value: 12 }],
    workQueue: [{ id: 'overdueTasks', value: 2, severity: 'danger' }, { id: 'overdueInvoices', value: 5, severity: 'warning' }, { id: 'projectRisk', value: 3, severity: 'warning' }],
  },
  crm: { total: 128, active: 120, newCurrent: 12, trend: trend.map(item => ({ ...item, customers: item.total })), byType: [{ id: 'business', value: 100 }, { id: 'private', value: 28 }] },
  projects: { active: 24, total: 40, trend: [] }, sales: { quotations: { open: 18 }, invoices: {}, orders: {} }, tasks: { open: 35 }, scheduling: { today: 12 }, accounting: {}, system: { users: {}, audit: {} },
};

async function prepare(page: Page, options: { restricted?: boolean; failedSource?: boolean; locale?: string } = {}) {
  const requests: string[] = [];
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'dashboard-fixture', url: origin }, { name: 'updata-locale', value: options.locale || 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: 'dashboard-user', firstName: 'Salman', lastName: 'Admin', role: { name: options.restricted ? 'Staff' : 'Admin', permissions: options.restricted ? ['tasks:read'] : [] } };
    else if (path === '/dashboard/analytics') { data = business; requests.push(url.search); }
    else if (path === '/dashboard/intelligence') {
      requests.push(url.search);
      data = options.restricted ? {} : options.failedSource ? { ...intelligence, assistant: { available: false, error: true } } : intelligence;
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id' }, body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Salman/ })).toBeVisible();
  return requests;
}

test('dashboard connects new analytics tabs, filters, charts, and workspace links', async ({ page }, info) => {
  await prepare(page);
  await expect(page.getByRole('tab', { name: 'AI assistant', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI & growth at a glance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Explore your workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice revenue', exact: true })).toBeVisible();
  await page.screenshot({ path: `/private/tmp/updata-dashboard-overview-${info.project.name}.png`, fullPage: true });
  for (const [label, id] of [['AI assistant', 'assistant'], ['AI calling', 'calling'], ['Incoming calls', 'incoming'], ['Leads & follow-ups', 'leads']]) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.getByTestId(`dashboard-${id}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Activity over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Activity by status' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  // Lead inventory is lifetime; its period total must remain 142 rather than 320.
  await expect(page.getByTestId('dashboard-leads').getByText('142', { exact: true })).toBeVisible();
  await expect(page.getByTestId('dashboard-leads').getByText('320', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'AI calling', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open workspace', exact: true })).toHaveAttribute('href', '/ai-calling');
  await expect(page.getByTestId('dashboard-calling').getByText('75%', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/private/tmp/updata-dashboard-calling-${info.project.name}.png`, fullPage: true });
  await page.getByRole('combobox', { name: 'Analytics range' }).click();
  await page.getByRole('option', { name: '7 days', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh analytics', exact: true }).click();
  await expect(page.getByTestId('dashboard-calling')).toBeVisible();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await expect(page.getByTestId('dashboard-calling')).toHaveCSS('color', 'rgb(23, 43, 58)');
});

test('restricted roles see their permitted workspaces without communication tabs', async ({ page }) => {
  await prepare(page, { restricted: true });
  for (const label of ['AI assistant', 'AI calling', 'Incoming calls', 'Leads & follow-ups']) await expect(page.getByRole('tab', { name: label, exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Tasks', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invoice revenue', exact: true })).toHaveCount(0);
});

test('dashboard tabs stay on one scrollable row at every viewport width', async ({ page }) => {
  await prepare(page);
  const navigation = page.locator('.dashboard-tab-navigation');
  const tabs = page.getByRole('tablist');
  for (const width of [390, 1280, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    const positions = await tabs.getByRole('tab').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    expect(await navigation.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await tabs.getByRole('tab').first().focus();
    await page.keyboard.press('End');
    await expect(tabs.getByRole('tab').last()).toBeFocused();
    await expect(tabs.getByRole('tab').last()).toBeInViewport();
  }
});

test('a failed AI source is unavailable while other sources remain usable', async ({ page }) => {
  await prepare(page, { failedSource: true });
  await page.getByRole('tab', { name: 'AI assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'This overview could not be loaded' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Incoming calls', exact: true }).click();
  await expect(page.getByTestId('dashboard-incoming')).toBeVisible();
});

test('Arabic dashboard keeps tabs, charts, and links inside the viewport', async ({ page }) => {
  await prepare(page, { locale: 'ar' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('tab', { name: 'المكالمات الواردة', exact: true }).click();
  await expect(page.getByTestId('dashboard-incoming')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
