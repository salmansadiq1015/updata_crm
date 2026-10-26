/**
 * FULL-STACK paired-phone E2E: the real web UI against the real CRM API (isolated DB), the real AI
 * agent worker (LiveKit Cloud + OpenAI Realtime) and the real gateway code. Only the ESP32 board,
 * the phone and the lead are simulated (server/phone-gateway/test/e2e/sim-gateway.mjs).
 *
 *   1. cd server && node tests/e2e/pairedPhone.stack.mjs          (API :9097 + agent worker)
 *   2. cd client && E2E_FULL_STACK=1 npx playwright test e2e/paired-phone.full.spec.ts --project=desktop-chromium
 *
 * Costs a few cents of OpenAI/LiveKit (three ~1-minute calls). Screenshots: E2E_SHOTS=<dir>.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:9097/api/v1';
const ADMIN = { email: 'e2e-admin@example.com', password: 'E2e-Paired-Phone-2026!' };
const CITY = `E2E-${Date.now().toString(36)}`;
const shots = process.env.E2E_SHOTS;
const SIM = resolve(__dirname, '../../server/phone-gateway/test/e2e/sim-gateway.mjs');

// One scenario per dial, in dial order: qualifies · declines · USB unplugged mid-call.
const SCENARIOS = [
  { lines: ['Hello?', 'Yes, go ahead.', 'Yes, we are still operating.', 'We have twelve employees.', 'Yes, that is correct.', 'Yes.', 'Okay, thank you, goodbye.'] },
  { lines: ['Hello?', 'Yes, go ahead.', 'No, we closed the business last year.', 'Nobody works here anymore, zero.', 'Yes.', 'Goodbye.'] },
  { lines: ['Hello?', 'Yes, go ahead.'], unplugAfterMs: 9000 },
];

test.skip(!process.env.E2E_FULL_STACK, 'needs the isolated stack: see the header of this file');

async function shot(page: Page, name: string) {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
}

async function apiLogin(request: APIRequestContext) {
  const res = await request.post(`${API}/auth/login`, { data: ADMIN });
  expect(res.ok(), await res.text()).toBeTruthy();
  const data = (await res.json()).data;
  return data.accessToken || data.tokens?.accessToken;
}

function startSim(code: string, events: Array<Record<string, unknown>>): ChildProcess {
  const child = spawn(process.execPath, [SIM, '--api', API, '--code', code, '--scenarios', JSON.stringify(SCENARIOS)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  child.stdout!.on('data', (chunk) => {
    buf += String(chunk);
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { events.push(JSON.parse(line)); } catch { /* not JSON */ }
    }
  });
  child.stderr!.on('data', () => {});
  return child;
}

const seen = (events: Array<Record<string, unknown>>, event: string) => events.filter((e) => e.event === event).length;

test('paired phone: pair → provision → verify → kill switch → 3-lead AI campaign → live monitor → recovery → revoke', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'one full run is enough; phone widths are checked inside');
  test.setTimeout(20 * 60_000);
  const token = await apiLogin(request);
  const auth = { Authorization: `Bearer ${token}` };
  const DEVICE = `E2E bridge ${CITY}`;

  // Isolated DB, but reruns must not see the previous run's device.
  const leftover = (await (await request.get(`${API}/paired-phone/devices`, { headers: auth })).json()).data || [];
  for (const dev of leftover.filter((x: { revoked: boolean }) => !x.revoked)) {
    await request.post(`${API}/paired-phone/devices/${dev.id}/revoke`, { headers: auth });
  }

  // ---- leads (API) -----------------------------------------------------------------------------
  // Lead geography keeps only canonical cities, so the campaign targets a real one (Lahore). Leads
  // from earlier runs in the isolated DB are removed first so exactly these three are called.
  const old = (await (await request.get(`${API}/crm/leads?q=E2E-&limit=100`, { headers: auth })).json()).data || [];
  for (const lead of old) await request.delete(`${API}/crm/leads/${lead._id || lead.id}`, { headers: auth });
  for (const [i, name] of ['Rahim Traders', 'Ayesha Textiles', 'Bilal Steel'].entries()) {
    const res = await request.post(`${API}/crm/leads`, {
      headers: auth,
      data: { name: `${name} ${CITY}`, mobile: `+92300765432${i}`, address: { city: 'Lahore', country: 'PK' }, source: 'manual' },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }

  // ---- login (UI) ------------------------------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN.email);
  await page.locator('#password').fill(ADMIN.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
  await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Paired phones' })).toBeVisible({ timeout: 120_000 });
  const others = ((await (await request.get(`${API}/paired-phone/devices`, { headers: auth })).json()).data || []).filter((x: { revoked: boolean }) => !x.revoked);
  if (others.length === 0) await expect(page.getByText('No paired phone yet')).toBeVisible();

  // ---- pair a phone: code from the UI → simulated gateway ---------------------------------------
  await page.getByRole('button', { name: 'Add paired phone' }).click();
  await page.getByLabel('Device name').fill(DEVICE);
  await page.getByLabel('Phone / SIM label (optional)').fill('TECNO · Jazz SIM');
  await page.getByRole('button', { name: 'Create pairing code' }).click();
  const code = (await page.getByRole('dialog', { name: 'Add a paired phone' }).getByLabel('Pairing code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(page.getByText(new RegExp(`--code ${code}`))).toBeVisible();

  const events: Array<Record<string, unknown>> = [];
  const sim = startSim(code, events);
  try {
    // Live setup checklist inside the dialog turns green as the gateway reports in.
    const dialog = page.getByRole('dialog', { name: 'Add a paired phone' });
    await expect(dialog.getByText('Phone connected (hands-free)')).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => dialog.getByLabel('waiting').count(), { timeout: 60_000 }).toBe(1); // only "audio verified" left
    await shot(page, '01-pairing-dialog');
    await dialog.getByRole('button', { name: 'Done' }).click();

    const card = page.getByRole('article', { name: `Paired phone ${DEVICE}` });
    await expect(card.getByRole('status')).toHaveText('Not ready');
    await expect(card.getByText(/firmware 0\.1\.0-fake/)).toBeVisible();

    // Limits: shorter cooldown so the test does not wait a minute between calls.
    await card.getByRole('button', { name: 'Limits' }).click();
    await page.getByLabel('Pause between calls (s)').fill('20');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('20s')).toBeVisible();

    // Gate A per device (attested here; the simulated board has no real audio to verify).
    await card.getByRole('button', { name: 'Verify call audio' }).click();
    const confirm = page.getByRole('button', { name: 'Confirm verified' });
    await expect(confirm).toBeDisabled();
    await page.getByRole('checkbox', { name: /remote\.wav/ }).check();
    await page.getByRole('checkbox', { name: /heard the AI prompt/ }).check();
    await page.getByLabel(/Evidence note/).fill('E2E: simulated board; audio not physically verified');
    await confirm.click();
    await expect(card.getByRole('status')).toHaveText('Ready to call', { timeout: 30_000 });
    await shot(page, '02-device-ready');

    // Phone width: the panel must not scroll sideways.
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalScroll(page);
    await shot(page, '03-device-ready-390');
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- campaign wizard: calls from the paired phone ------------------------------------------
    await page.getByRole('button', { name: 'New campaign' }).click();
    await page.getByLabel('Campaign name').fill(`Paired phone ${CITY}`);
    await page.getByLabel('Agent name').fill('Sara');
    await page.getByLabel('Company name (disclosed)').fill('Updata');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByLabel('Question 1 label').fill('Still operating');
    await page.getByLabel('Question 1 answer type').selectOption('boolean');
    await page.getByLabel('Question 1 text').fill('Is your business still operating?');
    await page.getByRole('button', { name: 'Add question' }).click();
    await page.getByLabel('Question 2 label').fill('Employees');
    await page.getByLabel('Question 2 answer type').selectOption('integer');
    await page.getByLabel('Question 2 text').fill('How many employees do you have?');
    await page.getByRole('button', { name: 'Next', exact: true }).click(); // → rules
    await page.getByRole('button', { name: 'Next', exact: true }).click(); // → schedule & leads
    await page.getByLabel('City').fill('Lahore');
    await page.getByLabel('Max attempts/lead').fill('1');
    await page.getByLabel('Window start').fill('00:00');
    await page.getByLabel('Window end').fill('23:59');
    await page.getByRole('radio', { name: /My paired phone/ }).check();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Choose the paired phone'); // validation: no device yet
    const deviceSelect = page.getByRole('combobox', { name: /^Paired phone/ });
    const deviceValue = await deviceSelect.locator('option', { hasText: DEVICE }).getAttribute('value');
    await deviceSelect.selectOption(deviceValue!);
    await expect(page.getByText(/^Ready\. Up to 20 calls\/hour, 20s between calls\./)).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(`Paired phone: ${DEVICE}`)).toBeVisible();
    await shot(page, '04-wizard-review');
    await page.getByRole('button', { name: 'Create draft campaign' }).click();

    // ---- kill switch blocks the start ----------------------------------------------------------
    await expect(page.getByRole('button', { name: /^Start$/ })).toBeVisible({ timeout: 30_000 });
    // Close the drawer to reach the workspace switch.
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    await page.getByRole('button', { name: 'Stop all calling' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Stop all calling' }).or(page.getByRole('dialog').getByRole('button', { name: 'Stop all calling' })).first().click();
    await expect(page.getByRole('region', { name: 'AI voice calling status' }).getByText('Paused')).toBeVisible();
    const campaigns = await (await request.get(`${API}/ai-calling/campaigns`, { headers: auth })).json();
    const campaignId = campaigns.data.find((c: { name: string }) => c.name === `Paired phone ${CITY}`)._id;
    const blocked = await request.post(`${API}/ai-calling/campaigns/${campaignId}/start`, { headers: auth, data: {} });
    expect(blocked.status()).toBe(409);
    expect(await blocked.text()).toContain('kill switch');
    await page.getByRole('button', { name: 'Resume calling' }).click();
    await expect(page.getByRole('region', { name: 'AI voice calling status' }).getByText('Active')).toBeVisible();

    // ---- start and watch live --------------------------------------------------------------------
    await page.getByRole('row', { name: new RegExp(`Paired phone ${CITY}`) }).click();
    await page.getByRole('button', { name: /^Start$/ }).click();
    const live = page.getByText(/call(s)? in progress/);
    await expect(live).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Paired phone', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Audio live', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => seen(events, 'agent_spoke'), { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('meter', { name: 'AI → lead' })).toBeVisible();
    await shot(page, '05-live-call');
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalScroll(page);
    await shot(page, '06-live-call-390');
    await page.setViewportSize({ width: 1280, height: 900 });

    // Three dials: call 1 + 2 converse, call 3 loses the USB link mid-call.
    await expect.poll(() => seen(events, 'unplugged'), { timeout: 8 * 60_000, intervals: [2000] }).toBe(1);
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
    const heldCard = page.getByRole('article', { name: `Paired phone ${DEVICE}` });
    await expect(heldCard.getByRole('status')).toHaveText('Needs attention', { timeout: 90_000 });
    await shot(page, '07-needs-attention');
    // The board "reboots" (reconnects) by itself; the operator checks the phone and clears it.
    await expect.poll(() => seen(events, 'board_connected'), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);
    await heldCard.getByRole('button', { name: 'Phone checked · clear' }).click();
    await page.getByRole('button', { name: 'Phone is idle · clear' }).click();
    await expect(heldCard.getByRole('status')).not.toHaveText('Needs attention', { timeout: 30_000 });

    // ---- results in the CRM ----------------------------------------------------------------------
    const recipients = (await (await request.get(`${API}/ai-calling/campaigns/${campaignId}/recipients?limit=10`, { headers: auth })).json()).data;
    expect(seen(events, 'call_dialed')).toBe(3);
    const lastCalls = await Promise.all(recipients.map(async (r: { lastCallId: string }) => (await (await request.get(`${API}/ai-calling/calls/${r.lastCallId}`, { headers: auth })).json()).data));
    const byState = lastCalls.reduce((acc: Record<string, number>, c: { state: string }) => ({ ...acc, [c.state]: (acc[c.state] || 0) + 1 }), {});
    testInfo.attach('calls', { body: JSON.stringify(lastCalls.map((c: Record<string, unknown>) => ({ state: c.state, disposition: c.disposition, qualification: c.qualification, answers: c.answers, gateway: c.gateway })), null, 2), contentType: 'application/json' });
    expect(byState.needs_reconcile).toBe(1); // the unplugged call: never redialed
    expect(byState.completed).toBe(2);
    const answered = lastCalls.filter((c: { state: string }) => c.state === 'completed');
    const active = answered.map((c: { answers: Array<{ label: string; normalizedValue: unknown }> }) => c.answers.find((x) => x.label === 'Still operating')?.normalizedValue);
    expect(active.map(String).sort()).toEqual(['false', 'true']);
    // The summary is recomputed after each call's results land; poll rather than read it once.
    const summary = async () => (await (await request.get(`${API}/ai-calling/campaigns/${campaignId}`, { headers: auth })).json()).data.summary;
    await expect.poll(async () => { const s = await summary(); return s.completed + s.failed + s.needsReconcile; }, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
    // The parked call is counted as an unknown outcome for review: not "No answer", not "Failed".
    expect(await summary()).toMatchObject({ completed: 2, needsReconcile: 1, failed: 0, noAnswer: 0 });
    expect((await summary()).needsReview).toBeGreaterThanOrEqual(1);
    // Bulk "Retry failed" never redials an unknown outcome.
    expect((await (await request.post(`${API}/ai-calling/campaigns/${campaignId}/retry`, { headers: auth, data: {} })).json()).data.retried).toBe(0);

    // ---- the owner resolves the unknown outcome by hand: the only way it leaves review ---------------
    await page.getByRole('row', { name: new RegExp(`Paired phone ${CITY}`) }).click();
    await page.getByRole('tab', { name: 'Recipients' }).click();
    await page.getByRole('row').filter({ hasText: 'Resolve' }).click();
    const resolvePanel = page.getByRole('region', { name: 'Resolve unknown outcome' });
    await expect(resolvePanel.getByText(/never called again automatically/)).toBeVisible();
    await shot(page, '08-resolve-outcome');
    await resolvePanel.getByRole('radio', { name: 'Not reached · close' }).check();
    await resolvePanel.getByRole('button', { name: /Resolve outcome/ }).click();
    await expect(resolvePanel).toBeHidden();
    await expect.poll(async () => (await summary()).needsReconcile, { timeout: 15_000 }).toBe(0);
    expect(await summary()).toMatchObject({ completed: 2, needsReconcile: 0 });
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();

    // ---- revoke: the gateway is cut off at once --------------------------------------------------
    await heldCard.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: /^Revoke$/ }).last().click();
    await expect.poll(() => seen(events, 'revoked'), { timeout: 30_000 }).toBe(1);
    await expect(page.getByText(/revoked device/)).toBeVisible();
    await shot(page, '09-revoked');
  } finally {
    sim.kill('SIGTERM');
  }
});
