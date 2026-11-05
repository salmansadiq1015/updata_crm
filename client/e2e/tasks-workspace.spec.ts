import { expect, test, type Page } from '@playwright/test';

const userId = '507f1f77bcf86cd799439011';
const listId = '507f1f77bcf86cd799439012';
const taskId = '507f1f77bcf86cd799439013';
const task = {
  _id: taskId, title: 'Prepare client launch', description: '<p>Review the launch checklist with the team.</p>',
  listId, status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: userId, assigneeIds: [userId],
  dueDate: '2026-11-10T12:00:00.000Z', createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-05T09:00:00.000Z', version: 1,
};

async function prepare(page: Page, options: { sampleError?: boolean; dashboardError?: boolean; saveError?: boolean } = {}) {
  const origin = new URL(test.info().project.use.baseURL || 'http://localhost:3000').origin;
  const requests: string[] = [];
  await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); localStorage.setItem('tasks.analyticsOpen', 'true'); });
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'tasks-fixture', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: userId, firstName: 'Salman', lastName: 'Admin', role: { name: 'Admin', permissions: [] } };
    else if (path === '/task-lists') data = [{ _id: listId, name: 'Launch operations', openTaskCount: 1 }];
    else if (path === '/task-folders') data = { folders: [] };
    else if (path === '/tasks/dashboard') {
      if (options.dashboardError) return route.fulfill({ status: 503, headers, json: { success: false, message: 'Unavailable' } });
      data = { overdue: [], dueToday: [], upcoming: [task], recentlyCompleted: [] };
    } else if (path === '/tasks/dashboard/stats') data = { totalOpen: 1, completedThisWeek: 0, overdueCount: 0, totalTasks: 1 };
    else if (path === '/tasks') {
      requests.push(url.search);
      if (options.sampleError && url.searchParams.get('status') === 'ON_HOLD') return route.fulfill({ status: 503, headers, json: { success: false, message: 'Sample unavailable' } });
      data = url.searchParams.get('status') === 'ON_HOLD' ? [] : [task];
    } else if (path === `/tasks/${taskId}`) {
      if (options.saveError && route.request().method() === 'PUT') return route.fulfill({ status: 503, headers, json: { success: false, message: 'Save unavailable' } });
      data = task;
    }
    await route.fulfill({ contentType: 'application/json', headers, json: { success: true, data, pagination: { hasNext: false, nextCursor: null, limit: 50 } } });
  });
  return requests;
}

test('tasks survive a failed chart sample and metric filters use personal active work', async ({ page }, info) => {
  const requests = await prepare(page, { sampleError: true });
  await page.goto('/tasks');
  const workspace = page.getByTestId('task-workspace');
  await expect(workspace.getByText('Some chart samples are unavailable.', { exact: false })).toBeVisible();
  await expect(workspace.getByText('Task dashboard could not be loaded')).toHaveCount(0);
  await expect(workspace.getByText('Prepare client launch').first()).toBeVisible();
  await workspace.getByRole('button', { name: /^Open 1/ }).click();
  await expect.poll(() => requests.some(query => query.includes('active=true') && query.includes(`assigneeId=${userId}`))).toBe(true);
  await expect(workspace.getByRole('button', { name: 'Clear filters', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/private/tmp/updata-tasks-${info.project.name}.png`, fullPage: true });
});

test('analysis failure stays contained and task list remains reachable', async ({ page }) => {
  const options = { dashboardError: true };
  await prepare(page, options);
  await page.goto('/tasks');
  await expect(page.getByText('Task dashboard could not be loaded')).toBeVisible();
  const content = page.getByRole('main', { name: 'Tasks', exact: true });
  await expect(content.getByText('Prepare client launch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  options.dashboardError = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Task dashboard could not be loaded')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Due-date trend', exact: true })).toBeVisible();
});

test('task detail is responsive and retains description edits after a failed save', async ({ page }, info) => {
  const options = { saveError: true };
  await prepare(page, options);
  await page.goto(`/tasks/${listId}/${taskId}`);
  const detail = page.getByTestId('task-detail');
  await expect(detail.getByRole('button', { name: 'Copy task link' })).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Mark complete' })).toBeVisible();
  await detail.getByText('Review the launch checklist with the team.').click();
  await detail.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(detail.locator('[contenteditable="true"]').first()).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  options.saveError = false;
  await detail.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/private/tmp/updata-task-detail-${info.project.name}.png`, fullPage: true });
  const dueDate = detail.locator('input[type="date"]').last();
  await dueDate.scrollIntoViewIfNeeded();
  await expect(dueDate).toBeVisible();
});

test('task scrolling stays inside the workspace without a blank area below it', async ({ page }) => {
  await prepare(page);
  await page.goto(`/tasks/${listId}/${taskId}`);
  const detail = page.getByTestId('task-detail');
  await expect(detail).toBeVisible();
  const geometry = () => page.evaluate(() => {
    const shell = document.querySelector('.updata-workspace')!;
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      shellTop: shell.getBoundingClientRect().top,
      shellBottom: shell.getBoundingClientRect().bottom,
    };
  });
  let bounds = await geometry();
  expect(bounds.documentHeight).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  const dueDate = detail.locator('input[type="date"]').last();
  await dueDate.scrollIntoViewIfNeeded();
  await expect(dueDate).toBeInViewport();
  await page.mouse.wheel(0, 1800);
  bounds = await geometry();
  expect(bounds.shellTop).toBe(0);
  expect(bounds.shellBottom).toBe(bounds.viewportHeight);
  expect(bounds.documentHeight).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  const fileChooser = page.waitForEvent('filechooser');
  await detail.getByRole('button', { name: 'Upload', exact: true }).click();
  await fileChooser;
});
