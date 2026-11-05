import { expect, test, type Page } from '@playwright/test';
import type { TaskTimeSession } from '../src/modules/tasks/types/task-time-types';

const userId = '507f1f77bcf86cd799439011';
const listId = '507f1f77bcf86cd799439012';
const taskId = '507f1f77bcf86cd799439013';
const task = { _id: taskId, title: 'Prepare client launch', description: '<p>Launch checklist</p>', listId, status: 'IN_PROGRESS', priority: 'HIGH', assigneeId: userId, createdBy: userId };

async function prepare(page: Page) {
  const origin = new URL(test.info().project.use.baseURL || 'http://localhost:3000').origin;
  let session: TaskTimeSession | null = null;
  let segmentAt = Date.now();
  let counter = 0;
  const stopped: TaskTimeSession[] = [];
  const options = { failStop: false };
  const snapshot = () => session ? { ...session, elapsedMs: session.elapsedMs + (session.status === 'RUNNING' ? Date.now() - segmentAt : 0) } : null;
  const summary = () => {
    const active = snapshot();
    const sessions = [...(active ? [active] : []), ...stopped].map(row => ({ ...row, userName: 'Salman Admin' }));
    const totalMs = sessions.reduce((sum, row) => sum + row.elapsedMs, 0);
    const metrics = { totalMs, sessionCount: sessions.length, activeCount: active ? 1 : 0, focusCount: sessions.filter(row => row.mode === 'FOCUS').length, taskCount: sessions.length ? 1 : 0, averageSessionMs: stopped.length ? stopped.reduce((sum, row) => sum + row.elapsedMs, 0) / stopped.length : 0, averageTaskMs: totalMs };
    return { ...metrics, asOf: new Date().toISOString(), days: 0, myTotalMs: totalMs, sessions, employees: sessions.length ? [{ ...metrics, userId, name: 'Salman Admin', lastStartedAt: sessions[0].startedAt }] : [], page: 1, hasMore: false };
  };
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'task-timer-fixture', url: origin }, { name: 'updata-locale', value: 'en', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: userId, firstName: 'Salman', lastName: 'Admin', role: { name: 'Admin', permissions: [] } };
    else if (path === '/users/directory') data = [{ _id: userId, firstName: 'Salman', lastName: 'Admin' }];
    else if (path === '/task-lists') data = [{ _id: listId, name: 'Launch operations' }];
    else if (path === '/task-folders') data = { folders: [] };
    else if (path === '/tasks/dashboard') data = { overdue: [], dueToday: [], upcoming: [], recentlyCompleted: [] };
    else if (path === '/tasks/dashboard/stats') data = { totalOpen: 1, completedThisWeek: 0, overdueCount: 0, totalTasks: 1 };
    else if (path === '/tasks/time-tracking/active') data = { session: snapshot(), asOf: new Date().toISOString() };
    else if (path === `/tasks/${taskId}/time-tracking/start`) {
      const body = route.request().postDataJSON();
      session = { id: `timer-${++counter}`, taskId, taskTitle: task.title, userId, status: 'RUNNING', mode: body.mode, targetMinutes: body.targetMinutes, startedAt: new Date().toISOString(), stoppedAt: null, elapsedMs: 62000, pauseCount: 0, note: '', stopReason: null };
      segmentAt = Date.now();
      data = { session: snapshot(), asOf: new Date().toISOString() };
    } else if (path.startsWith('/tasks/time-tracking/sessions/')) {
      const action = path.split('/').at(-1);
      if (action === 'stop' && options.failStop) return route.fulfill({ status: 503, headers, json: { success: false, message: 'Timer update failed' } });
      if (session) {
        session = snapshot();
        if (action === 'pause') session = { ...session!, status: 'PAUSED', pauseCount: session!.pauseCount + 1 };
        if (action === 'resume') { session = { ...session!, status: 'RUNNING' }; segmentAt = Date.now(); }
        if (action === 'stop') { stopped.unshift({ ...session!, status: 'STOPPED', stoppedAt: new Date().toISOString(), note: route.request().postDataJSON().note, stopReason: 'USER' }); session = null; }
      }
      data = { session: snapshot(), asOf: new Date().toISOString() };
    } else if (path === `/tasks/${taskId}/time-tracking` || path === '/tasks/time-tracking/report') data = summary();
    else if (path === `/tasks/${taskId}`) data = task;
    else if (path === '/tasks') data = [task];
    await route.fulfill({ headers, json: { success: true, data, pagination: { hasNext: false, nextCursor: null, limit: 50 } } });
  });
  return options;
}

test('focus sessions pause, persist through reload, resume and save stop notes', async ({ page }, info) => {
  const options = await prepare(page);
  await page.goto(`/tasks/${listId}/${taskId}`);
  const panel = page.getByTestId('task-time-panel');
  await expect(panel.getByRole('button', { name: 'Start focus', exact: true })).toBeEnabled({ timeout: 60000 });
  await panel.getByRole('button', { name: 'Start focus', exact: true }).click();
  const focus = page.getByRole('dialog', { name: task.title });
  await expect(focus).toBeVisible();
  await expect(focus.getByRole('progressbar', { name: 'Focus goal' })).toBeVisible();
  await page.screenshot({ path: `/private/tmp/updata-task-focus-${info.project.name}.png` });
  await focus.getByRole('button', { name: 'Pause / take a break', exact: true }).click();
  await expect(focus.getByText('Paused', { exact: true })).toBeVisible();
  const pausedValue = await focus.getByRole('timer').textContent();
  await page.reload();
  const dock = page.getByTestId('task-timer-dock');
  await expect(dock.getByText('Paused', { exact: true })).toBeVisible();
  await expect(dock.getByRole('timer')).toHaveText(pausedValue!);
  await dock.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(dock.getByText('Tracking time', { exact: true })).toBeVisible();
  await dock.getByRole('button', { name: 'Stop timer', exact: true }).click();
  const stopDialog = page.getByRole('dialog', { name: 'Finish this session' });
  await stopDialog.getByRole('textbox', { name: 'Session note (optional)' }).fill('Reviewed launch plan with the team.');
  options.failStop = true;
  await stopDialog.getByRole('button', { name: 'Save & stop', exact: true }).click();
  await expect(page.getByText('Timer update failed', { exact: true })).toBeVisible();
  await expect(stopDialog.getByRole('textbox')).toHaveValue('Reviewed launch plan with the team.');
  options.failStop = false;
  await stopDialog.getByRole('button', { name: 'Save & stop', exact: true }).click();
  await expect(stopDialog).toHaveCount(0);
  await expect(dock).toHaveCount(0);
  await expect(panel.getByText('Reviewed launch plan with the team.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Start timer', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `/private/tmp/updata-task-time-${info.project.name}.png` });
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Task time report', exact: true }).click();
  const report = page.getByTestId('task-time-report');
  await expect(report.getByText('Salman Admin', { exact: true })).toBeVisible();
  await report.getByRole('combobox', { name: 'Report scope' }).click();
  await page.getByRole('option', { name: 'Team', exact: true }).click();
  await expect(report.getByText('Salman Admin', { exact: true })).toBeVisible();
});
