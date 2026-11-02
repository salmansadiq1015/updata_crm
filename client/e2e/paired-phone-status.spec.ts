import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// UI-only regression: every API response is mocked in this isolated browser.
// It never registers a real gateway or uses the owner's browser credentials.
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const bridge = () => ({
  id: 'ui-test', name: 'Connection UI test', phoneLabel: 'Test Android', kind: 'esp32_hfp', revoked: false,
  archived: false, archivedAt: null as string | null,
  online: true, lastHeartbeatAt: new Date().toISOString(), gateway: { version: '0.3.0', platform: 'darwin' },
  board: { connected: true, port: '/dev/cu.usbserial-test', bdaddr: '24:0A:C4:00:11:22', firmware: '0.1.0', idf: 'v5.5.6', keyProvisioned: false },
  state: { device: 'bt_ready', hfp: 'disconnected', call: 0, callsetup: 0, audio: 'off', codec: 'none', peer: null },
  keyState: 'pending', audioVerified: false, audioVerifiedAt: null,
  readiness: { ok: false, reasons: ['key_not_provisioned'], messages: ['Dial key is not provisioned'], blocking: true },
  limits: { cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100 },
});

async function mockCrm(page: Page, devices: () => unknown[]) {
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'ui-fixture', url: origin }]);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'ui-fixture', refreshToken: 'ui-fixture' };
    else if (path === '/users/me') data = {
      _id: 'ui-user', firstName: 'UI', lastName: 'Test', email: 'ui@example.test',
      role: { name: 'Admin', permissions: ['ai-calling:read', 'ai-calling:write', 'ai-calling:admin'] },
    };
    else if (path === '/ai-calling/agents') data = { agents: [], summary: { agents: 0, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 0 } };
    else if (path === '/paired-phone/devices') data = devices();
    else if (path === '/ai-calling/campaigns') pagination = { page: 1, limit: 25, total: 0, pages: 1 };
    else if (path === '/ai-calling/telephony/health') data = { configured: false, livekitReady: true, reachable: true };
    else if (path === '/ai-calling/analytics') data = {
      campaigns: 0, totalCalls: 0, answered: 0, answerRate: null, qualified: 0, qualificationRate: null,
      callbacks: 0, avgCallSeconds: 0, totalCost: 0, reviews: 0, byDisposition: [], byQualification: [], byDay: [],
    };
    else if (path === '/ai-calling/settings') data = { voicePaused: false, pausedByEnv: false };
    else if (path === '/ai-calling/settings/providers') data = {
      primaryProvider: 'gemini', secondaryProvider: 'openai', primaryModel: 'gemini-test-live', secondaryModel: 'gpt-test-realtime', experimentalModel: '', geminiVoice: 'test-voice', fallbackEnabled: false,
      maxSessionSeconds: 60, maxCallCostUsd: 0, connectionTimeoutMs: 10000,
      credentials: { gemini: { stored: false, apiEnvironmentConfigured: false }, openai: { stored: false, apiEnvironmentConfigured: false } },
      health: { gemini: { status: 'unverified' }, openai: { status: 'unverified' } }, pricing: {}, pricingVerifiedAt: 'test fixture',
    };
    else if (path === '/link-assistant/settings') data = { paused: false, pausedByEnv: false, aiConfigured: false };
    await route.fulfill({
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id',
        'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      },
      body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }),
    });
  });
}

async function openCalling(page: Page) {
  // A dev HMR reload can defer authentication after the document's load event.
  // Assert connection states only after the mocked device query has completed.
  await page.goto('/ai-calling');
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/paired-phone/devices' && response.ok()),
    page.getByRole('tab', { name: 'Connections', exact: true }).click(),
  ]);
}

test('manual setup sends gateway actions, saves volume and never rotates a key for reconnect', async ({ page }) => {
  const commands: string[] = [];
  let gain = 0;
  let lastAction = '';
  const setup = () => ({ autoConnect: true, playbackGainDb: gain, command: lastAction ? { id: 'ui-command', action: lastAction, state: 'succeeded', expiresAt: new Date(Date.now() + 120000).toISOString(), message: 'Gateway confirmed the action completed' } : null });
  await mockCrm(page, () => { const d = bridge(); return [{ ...d, state: { ...d.state, hfp: commands.includes('connect_phone') ? 'slc' : 'disconnected' }, setup: setup() }]; });
  await page.route('**/api/v1/paired-phone/devices/ui-test/setup', async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === 'PATCH') gain = body.playbackGainDb;
    else { lastAction = body.action; commands.push(body.action); }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: setup() }) });
  });
  let rotated = false;
  await page.route('**/api/v1/paired-phone/devices/ui-test/rotate-key', async route => { rotated = true; await route.abort(); });
  await openCalling(page);
  const panel = page.getByRole('region', { name: 'Paired phones' });
  await panel.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Connected' })).toBeVisible();
  await panel.getByRole('button', { name: 'Check connection' }).click();
  await expect.poll(() => commands.length).toBe(2);
  await panel.getByRole('button', { name: 'Sound & test call' }).click();
  await panel.getByRole('combobox', { name: 'AI voice volume' }).selectOption('6');
  await panel.getByRole('button', { name: 'Save volume' }).click();
  await expect(panel.getByRole('button', { name: 'Save volume' })).toBeDisabled();
  expect(commands).toEqual(['connect_phone', 'status']);
  expect(rotated).toBe(false);
  await panel.getByRole('button', { name: 'Setup guide' }).click();
  await expect(panel.getByRole('region', { name: 'Phone bridge setup guide' })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`${width}px: prominent bridge status separates USB from Bluetooth and goes unknown when offline`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let current = bridge();
    await mockCrm(page, () => [{ ...current, lastHeartbeatAt: new Date().toISOString() }]);
    await openCalling(page);
    const panel = page.getByRole('region', { name: 'Paired phones' });
    await expect(panel.getByRole('group', { name: 'ESP32 USB: Connected' })).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Not connected' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Connect phone', exact: true })).toBeEnabled();
    await expect(panel.getByRole('region', { name: 'Bridge details' })).toBeHidden();
    await panel.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'Bridge details' })).toBeVisible();
    await panel.getByRole('button', { name: 'Show less', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Connections', exact: true })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('heading', { name: 'Agent test studio' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (process.env.BRIDGE_UI_SHOTS) {
      await page.screenshot({ path: `${process.env.BRIDGE_UI_SHOTS}/bridge-${width}.png` });
      const boxes = await Promise.all([
        panel.getByRole('button', { name: 'Connect phone', exact: true }).boundingBox(),
        panel.getByRole('group', { name: 'Computer: Online' }).boundingBox(),
        panel.getByRole('button', { name: 'Show more', exact: true }).boundingBox(),
      ]);
      writeFileSync(`${process.env.BRIDGE_UI_SHOTS}/bridge-${width}-bounds.json`, JSON.stringify({ viewport: page.viewportSize(), boxes }));
    }

    current = { ...current, state: { ...current.state, device: 'hfp_ready', hfp: 'slc' } };
    await panel.getByRole('button', { name: 'Refresh bridge status' }).click();
    await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Connected' })).toBeVisible();

    current = { ...current, board: { ...current.board, connected: false } };
    await panel.getByRole('button', { name: 'Refresh bridge status' }).click();
    await expect(panel.getByRole('group', { name: 'ESP32 USB: Not reachable' })).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Cannot check yet' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Connect phone', exact: true })).toBeEnabled();
    await expect(panel.getByText(/Your phone may still show Bluetooth connected/)).toBeVisible();

    current = { ...current, online: false };
    await panel.getByRole('button', { name: 'Refresh bridge status' }).click();
    await expect(panel.getByRole('group', { name: 'ESP32 USB: Cannot check yet' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reconnect gateway', exact: true })).toBeEnabled();
    await expect(panel.getByRole('button', { name: /Link computer/ })).toBeVisible();
    await panel.getByRole('button', { name: 'Reconnect gateway', exact: true }).click();
    await expect(panel.getByText(/Gateway is still offline/)).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Reconnect computer gateway' })).toBeVisible();
    await panel.getByRole('button', { name: 'Reconnect gateway', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Check gateway status', exact: true })).toBeEnabled();
    current = { ...current, online: true, board: { ...current.board, connected: true } };
    await panel.getByRole('button', { name: 'Check gateway status', exact: true }).click();
    await expect(panel.getByText(/Gateway is online/)).toBeVisible();
    await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Connected' })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Reconnect computer gateway' })).toHaveCount(0);
  });
}

test('an unregistered gateway has an honest setup state and an accessible pairing action', async ({ page }) => {
  await mockCrm(page, () => []);
  await openCalling(page);
  const panel = page.getByRole('region', { name: 'Paired phones' });
  await expect(panel.getByRole('group', { name: 'ESP32 USB: Not linked to CRM' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Phone Bluetooth: Waiting for gateway' })).toBeVisible();
  await panel.getByRole('button', { name: 'Add paired phone' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a paired phone' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create pairing code' })).toBeVisible();
});

test('creates two phones with separate setup commands, edits one and deletes only the selected phone', async ({ page }, testInfo) => {
  let phones: ReturnType<typeof bridge>[] = [];
  let serial = 0;
  await mockCrm(page, () => phones);
  await page.route('**/api/v1/paired-phone/devices/pairing-code', async route => {
    const input = route.request().postDataJSON();
    const id = input.deviceId || `phone-${++serial}`;
    if (!input.deviceId) phones.push({ ...bridge(), id, name: input.deviceName, phoneLabel: input.phoneLabel, online: false, lastHeartbeatAt: '' });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { code: `TEST-000${serial}`, deviceId: id, expiresAt: new Date(Date.now() + 600_000).toISOString() } }) });
  });
  await page.route(/\/api\/v1\/paired-phone\/devices\/phone-\d+(?:\/(?:archive|restore))?$/, async route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    const action = parts.at(-1);
    const id = ['archive', 'restore'].includes(action || '') ? parts.at(-2) : action;
    const input = route.request().method() === 'PATCH' ? route.request().postDataJSON() : {};
    if (route.request().method() === 'DELETE') phones = phones.filter(d => d.id !== id);
    else phones = phones.map(d => d.id === id ? { ...d, ...input, ...(['archive', 'restore'].includes(action || '') ? { archived: action === 'archive', archivedAt: action === 'archive' ? new Date().toISOString() : null } : {}) } : d);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: phones.find(d => d.id === id) || { id, deleted: true } }) });
  });
  await openCalling(page);
  const panel = page.getByRole('region', { name: 'Paired phones' });
  for (const [index, name] of ['Sales', 'Support'].entries()) {
    await panel.getByRole('button', { name: 'Add paired phone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a paired phone' });
    await dialog.getByRole('textbox', { name: 'Device name' }).fill(name);
    await dialog.getByRole('button', { name: 'Create pairing code' }).click();
    await expect(dialog.getByText(`node bin/updata-gateway.mjs run --profile phone-${index + 1}`, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Download gateway' })).toBeVisible();
    if (index === 0) await dialog.screenshot({ path: testInfo.outputPath('phone-setup.png') });
    await dialog.getByRole('combobox', { name: 'Your computer' }).selectOption('windows');
    await expect(dialog.getByText(/File Explorer/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await dialog.getByRole('button', { name: 'Close · finish setup later' }).click();
    await expect(panel.getByRole('article', { name: `Paired phone ${name}` })).toBeVisible();
  }
  await expect(panel.getByRole('article')).toHaveCount(2);
  await panel.screenshot({ path: testInfo.outputPath('paired-phones.png') });
  await expect(panel.getByRole('button', { name: 'Edit Sales', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Actions for Sales', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Archive Sales', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-actions-menu.png') });
  await page.getByRole('menuitem', { name: 'Edit Sales', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit phone' });
  await edit.getByRole('textbox', { name: 'Phone name' }).fill('Sales team');
  await edit.getByRole('textbox', { name: 'Phone / SIM label (optional)' }).fill('SIM 2');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(panel.getByRole('article', { name: 'Paired phone Sales team' })).toContainText('SIM 2');
  await panel.getByRole('button', { name: 'Actions for Sales team', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete Sales team', exact: true }).click();
  await page.getByRole('button', { name: 'Keep phone', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Actions for Sales team', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete Sales team', exact: true }).click();
  await page.getByRole('button', { name: 'Delete phone', exact: true }).click();
  await expect(panel.getByRole('article')).toHaveCount(1);
  await expect(panel.getByRole('article', { name: 'Paired phone Support' })).toBeVisible();
  await panel.getByRole('button', { name: /Link computer/ }).click();
  await page.getByRole('button', { name: 'Create pairing code' }).click();
  await expect(page.getByRole('dialog').getByText('node bin/updata-gateway.mjs run --profile phone-2', { exact: true })).toBeVisible();
  expect(phones).toHaveLength(1);
});


test('archives a phone through its three-dot menu and restores its saved setup', async ({ page }, testInfo) => {
  let current = { ...bridge(), online: false, lastHeartbeatAt: '' };
  await mockCrm(page, () => [current]);
  await page.route(/\/api\/v1\/paired-phone\/devices\/ui-test\/(archive|restore)$/, async route => {
    const archived = route.request().url().endsWith('/archive');
    current = { ...current, archived, archivedAt: archived ? new Date().toISOString() : null };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: current }) });
  });
  await openCalling(page);
  const panel = page.getByRole('region', { name: 'Paired phones' });
  const actions = panel.getByRole('button', { name: 'Actions for Connection UI test', exact: true });
  await expect(panel.getByRole('button', { name: 'Edit Connection UI test', exact: true })).toHaveCount(0);
  await actions.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Edit Connection UI test', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete Connection UI test', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-actions-menu.png') });
  await page.getByRole('menuitem', { name: 'Archive Connection UI test', exact: true }).click();
  await page.getByRole('button', { name: 'Keep active', exact: true }).click();
  expect(current.archived).toBe(false);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Archive Connection UI test', exact: true }).click();
  await page.getByRole('button', { name: 'Archive phone', exact: true }).click();
  await expect(panel.getByText('No active phones', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Archived phones (1)', exact: true }).click();
  await expect(panel.getByRole('article', { name: 'Archived phone Connection UI test', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Phone setup', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('archived-phones.png') });
  await actions.click();
  await page.getByRole('menuitem', { name: 'Restore Connection UI test', exact: true }).click();
  await expect(panel.getByText('No archived phones', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Active phones (1)', exact: true }).click();
  await expect(panel.getByRole('article', { name: 'Paired phone Connection UI test', exact: true })).toBeVisible();
  expect(current.name).toBe('Connection UI test');
  expect(current.board.bdaddr).toBe(bridge().board.bdaddr);
});
