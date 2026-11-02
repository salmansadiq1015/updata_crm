import { expect, test, type Page } from '@playwright/test';

// All CRM responses are fixtures. These checks never dial a real recipient.
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const fixture = (status = 'paused') => ({
  _id: 'campaign-controls', name: 'Follow up with selected leads', status, runMode: 'scheduled', transport: 'paired_phone', channel: 'voice',
  isTest: true, questionnaireVersion: 1, questionnaire: { questions: [] }, statusRules: [], agentConfig: { agentName: 'Salman' },
  schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '18:00' }, maxConcurrency: 1 },
  summary: { total: 2, eligible: 2, queued: 2, inProgress: 0, completed: 0, qualified: 0, callbacks: 0, needsReview: 0, totalCallSeconds: 0, actualCost: 0 },
});
async function prepare(page: Page, { readOnly = false, rejectStart = false, status = 'paused' } = {}) {
  let current = fixture(status);
  const starts: unknown[] = [];
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'fixture', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: 'fixture-user', firstName: 'UI', lastName: 'Check', email: 'fixture@example.test', role: { name: readOnly ? 'Reader' : 'Admin', permissions: readOnly ? ['ai-calling:read'] : ['ai-calling:read', 'ai-calling:write', 'ai-calling:admin'] } };
    else if (path === '/ai-calling/agents') data = { agents: [], summary: { agents: 0, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 0 } };
    else if (path === '/ai-calling/campaigns') { data = [current]; pagination = { page: 1, limit: 25, total: 1, pages: 1 }; }
    else if (path === '/ai-calling/campaigns/campaign-controls') data = current;
    else if (path.endsWith('/run-status')) data = { status: current.status, runMode: current.runMode, pending: 2, inProgress: 0, canStart: true, blockers: [], waits: [{ code: 'calling_hours', message: 'Waiting for the campaign’s calling hours.' }], nextAt: '2026-10-28T04:00:00Z', sequential: true };
    else if (/\/campaign-controls\/(start|resume)$/.test(path)) {
      starts.push(request.postDataJSON());
      if (rejectStart) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Calling service is offline. Try again when connected.' } }) }); return; }
      current = { ...current, status: 'running', runMode: request.postDataJSON().startNow ? 'immediate' : 'scheduled' }; data = current;
    } else if (path.endsWith('/campaign-controls/pause')) { current = { ...current, status: 'paused' }; data = current; }
    else if (path === '/ai-calling/telephony/health') data = { configured: false, livekitReady: true, reachable: true };
    else if (path === '/ai-calling/settings') data = { voicePaused: false };
    else if (path === '/link-assistant/settings') data = { paused: false };
    else if (path === '/ai-calling/analytics') data = { campaigns: 1, totalCalls: 0, answered: 0, answerRate: null, qualificationRate: null, byDisposition: [], byQualification: [], byDay: [] };
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' }, body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }) });
  });
  await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/ai-calling/campaigns' && r.ok()), page.goto('/ai-calling')]);
  await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
  return starts;
}

for (const width of [390, 1440]) {
  test(`${width}px: visible Start calling runs the queue, stays available on Simulate and pauses consistently`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const starts = await prepare(page);
    const overview = page.getByRole('region', { name: 'Campaign overview' });
    const start = overview.getByRole('button', { name: 'Start calling', exact: true });
    await expect(start).toBeVisible();
    await start.click();
    await expect(overview.getByRole('button', { name: 'Pause calling', exact: true })).toBeVisible();
    expect(starts).toEqual([{ scheduledAt: null, sequential: true, startNow: true }]);
    await expect(page.getByRole('region', { name: 'Campaign details', exact: true })).toHaveCount(0);
    await overview.getByRole('button', { name: 'Follow up with selected leads', exact: true }).click();
    const drawer = page.getByRole('region', { name: 'Campaign details', exact: true });
    await expect(drawer.getByRole('button', { name: 'Pause calling', exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Pause calling', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Start calling', exact: true })).toBeVisible();
    await expect(overview.getByRole('button', { name: 'Start calling', exact: true })).toBeVisible();
    await drawer.getByRole('tab', { name: 'Simulate', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Start calling', exact: true })).toBeVisible();
    await expect(drawer.getByText(/Calling hours:/)).toBeVisible();
    await expect(drawer.getByText('Waiting for the campaign’s calling hours.', { exact: true })).toBeVisible();
    if (process.env.CAMPAIGN_UI_SHOTS) await page.screenshot({ path: `${process.env.CAMPAIGN_UI_SHOTS}/campaign-${width}.png` });
  });
}

test('a failed Start leaves the campaign paused with a clear error', async ({ page }) => {
  await prepare(page, { rejectStart: true });
  await page.getByRole('button', { name: 'Follow up with selected leads', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Campaign details', exact: true });
  await drawer.getByRole('button', { name: 'Start calling', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('Calling service is offline');
  await expect(drawer.getByRole('button', { name: 'Start calling', exact: true })).toBeEnabled();
  await expect(drawer.getByRole('button', { name: 'Pause calling', exact: true })).toHaveCount(0);
});

test('read-only users see Start calling but cannot run a campaign', async ({ page }) => {
  const starts = await prepare(page, { readOnly: true, status: 'draft' });
  await expect(page.getByRole('button', { name: 'Start calling', exact: true })).toBeDisabled();
  expect(starts).toHaveLength(0);
});

test('a running campaign waiting for hours cannot bypass calling restrictions', async ({ page }) => {
  const starts = await prepare(page, { status: 'running' });
  await expect(page.getByRole('button', { name: 'Start calling now', exact: true })).toHaveCount(0);
  expect(starts).toHaveLength(0);
});

test('Start on schedule retains the calling-hours option and explicit immediate start', async ({ page }) => {
  const starts = await prepare(page);
  await page.getByRole('button', { name: 'Follow up with selected leads', exact: true }).click();
  const drawer = page.getByRole('region', { name: 'Campaign details', exact: true });
  await drawer.getByRole('button', { name: 'Start on schedule', exact: true }).click();
  await expect.poll(() => starts).toEqual([{ scheduledAt: null, sequential: true, startNow: false }]);
  await expect(drawer.getByRole('button', { name: 'Start calling now', exact: true })).toBeEnabled();
  await expect(drawer.getByText('Waiting for the campaign’s calling hours.', { exact: true })).toBeVisible();
});
