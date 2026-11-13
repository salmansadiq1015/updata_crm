import { expect, test } from '@playwright/test';

test('workflow management: paginate, filter, select, cancel, delete and retain published history', async ({ page, baseURL }, testInfo) => {
  const origin = baseURL || 'http://localhost:3000';
  const deleted: string[] = [];
  let workflows = Array.from({ length: 23 }, (_, i) => ({
    _id: `wf-${i}`, name: `Workflow ${String(i).padStart(2, '0')}`, description: 'Manage lead follow-ups',
    status: i === 0 ? 'published' : 'draft', publishedVersion: i === 0 ? 1 : null, latestVersion: i === 0 ? 1 : 0,
    triggerType: 'trigger.manual', createdAt: '2026-11-12T10:00:00Z', updatedAt: '2026-11-12T10:00:00Z',
    stats: { total: 0, active: 0, successRate: null },
  }));
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'workflow-fixture', url: origin }]);
  await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); localStorage.setItem('mb-language', 'en'); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'workflow-fixture', refreshToken: 'workflow-fixture' };
    else if (path === '/users/me') data = { _id: 'owner', firstName: 'Workflow', lastName: 'Tester', email: 'workflow@example.test', role: { name: 'Admin', permissions: ['workflow:read', 'workflow:write', 'workflow:publish'] } };
    else if (path === '/workflows' && request.method() === 'GET') {
      const search = url.searchParams.get('search') || ''; const status = url.searchParams.get('status');
      const rows = workflows.filter(w => (status ? w.status === status : w.status !== 'archived') && w.name.toLowerCase().includes(search.toLowerCase()));
      const limit = Number(url.searchParams.get('limit') || 20); const current = Number(url.searchParams.get('page') || 1);
      data = rows.slice((current - 1) * limit, current * limit);
      pagination = { page: current, limit, total: rows.length, pages: Math.ceil(rows.length / limit) };
    } else if (path.startsWith('/workflows/') && request.method() === 'DELETE') {
      const id = path.split('/').at(-1)!; deleted.push(id);
      const item = workflows.find(w => w._id === id)!;
      if (item.latestVersion) { item.status = 'archived'; data = { archived: true }; }
      else { workflows = workflows.filter(w => w._id !== id); data = { deleted: true }; }
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }) });
  });
  await page.goto('/automation/workflows');
  const mobile = testInfo.project.name === 'mobile-chromium';
  const rows = page.getByTestId(mobile ? 'workflow-card' : 'workflow-row');
  await expect(rows).toHaveCount(20);
  await expect(rows.first().getByRole('link', { name: /Workflow 00/ })).toHaveAttribute('href', '/automation/workflows/wf-0');
  await page.getByRole('textbox', { name: 'Search workflows…' }).fill('Workflow 22');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Workflow 22');
  await page.getByRole('textbox', { name: 'Search workflows…' }).fill('');
  await expect(rows).toHaveCount(20);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Select all workflows on this page' }).click();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(deleted).toEqual([]);
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(20);
  expect(deleted.sort()).toEqual(['wf-20', 'wf-21', 'wf-22']);
  await rows.first().getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(19);
  await expect(page.getByRole('status')).toContainText('1 archived');
  await page.getByRole('combobox', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Archived', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Workflow 00');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `/tmp/updata-workflow-table-${testInfo.project.name}.png`, fullPage: true });
});
