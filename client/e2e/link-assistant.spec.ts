import { expect, test, type Page, type Route } from '@playwright/test';

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
// Set LINK_E2E_SHOTS=<dir> to keep a screenshot of every screen at every width.
const shotsDir = process.env.LINK_E2E_SHOTS;

const question = (fieldKey: string, label: string, order: number) => ({
  fieldKey, label, text: `${label}?`, type: 'short_text', required: true, confirmCritical: false, order, options: [],
});
const summary = {
  total: 12, eligible: 12, ineligible: 0, queued: 0, inProgress: 2, completed: 5, answered: 7, noAnswer: 0, failed: 0, retryScheduled: 0,
  qualified: 3, unqualified: 1, callbacks: 1, needsReview: 2, doNotContact: 1, suppressed: 0, missingPhone: 0, totalCallSeconds: 0, actualCost: 0.01,
};
const campaign = {
  _id: 'c-link', name: 'Lahore solar follow-up — October', description: 'Leads from the website form', status: 'running', channel: 'web_link',
  questionnaireVersion: 1, questionnaire: { questions: [question('owner', 'Owns the building', 1), question('bill', 'Monthly electricity bill', 2)] },
  statusRules: [], summary, isTest: false, createdAt: '2026-10-20T08:00:00.000Z',
  agentConfig: { agentName: 'Alex', organizationName: 'Sunrise Solar', objective: '', language: 'en', voice: 'alloy', speakingStyle: 'professional', maxCallSeconds: 300, recordCall: false, disclosure: '' },
  schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '18:00' }, daysOfWeek: [1, 2, 3, 4, 5], maxConcurrency: 1, maxAttemptsPerLead: 2, retryDelayMinutes: 120, maxCallsPerDay: 100 },
  linkConfig: { voiceTier: 'off', languages: ['en', 'ur', 'roman_ur'], defaultLanguage: 'en' },
};
const sessionRow = (id: string, leadName: string, status: string, isTest = false) => ({
  id, campaignId: 'c-link', leadId: `l-${id}`, leadName, callId: `call-${id}`, callRecordId: `r-${id}`, status, outcome: null, language: 'roman_ur', turns: 6,
  funnel: {}, isTest, reminders: { sent: 0, lastSentAt: null }, usage: { cost: 0.0002, modelCalls: 3 },
  expiresAt: '2026-10-29T08:00:00.000Z', lastActivityAt: '2026-10-22T09:30:00.000Z', createdAt: '2026-10-22T08:00:00.000Z', closedAt: null,
});
const sessions = [
  sessionRow('s1', 'Bilal Traders and Sons (Pvt.) Ltd — Gulberg III branch', 'active'),
  sessionRow('s2', 'Ayesha Textiles', 'completed'),
  sessionRow('s3', 'Preview lead', 'opened', true),
];
const detail = {
  ...sessions[0], campaignName: campaign.name,
  funnel: { link_issued: '2026-10-22T08:00:00.000Z', sms_sent: '2026-10-22T08:01:00.000Z', link_opened: '2026-10-22T09:00:00.000Z', chat_started: '2026-10-22T09:01:00.000Z' },
  answers: [
    { fieldKey: 'owner', label: 'Owns the building', value: true, validation: 'valid', confirmed: true, unknown: false },
    { fieldKey: 'bill', label: 'Monthly electricity bill', value: null, validation: 'unknown', confirmed: false, unknown: true },
  ],
  transcript: [
    { role: 'assistant', text: "Assalam o Alaikum! Main Ayesha hoon, Sunrise Solar ki AI assistant. Shuru karein?", at: '2026-10-22T09:00:00.000Z', source: 'template' },
    { role: 'customer', text: 'ji', at: '2026-10-22T09:01:00.000Z', source: 'customer' },
    { role: 'assistant', text: 'Kya aap is building ke maalik hain? Hamara number +92 300 1234567 hai.', at: '2026-10-22T09:01:05.000Z', source: 'model' },
  ],
  disposition: null, qualification: null, reviewRequired: true, openQuestions: [{ text: 'Installation ki qeemat kya hai?', at: '2026-10-22T09:03:00.000Z' }],
};
const analytics = {
  campaignId: 'c-link', sessions: 40,
  funnel: { link_issued: 40, sms_sent: 38, delivered: 21, link_opened: 26, chat_started: 19, completed: 12, abandoned: 4, opted_out: 2, expired: 1 },
  rates: { openRate: 68.4, startRate: 73.1, completionRate: 63.2, optOutRate: 7.7 },
  perQuestion: [
    { fieldKey: 'owner', label: 'Owns the building', answered: 18, unknown: 1, dropOff: 2, unknownRate: 5.3 },
    { fieldKey: 'bill', label: 'Monthly electricity bill', answered: 12, unknown: 6, dropOff: 5, unknownRate: 33.3 },
  ],
  averageCompletionSeconds: 194, cost: { total: 0.0123, perCompleted: 0.001 },
};
const settings = { paused: false, pausedByEnv: false, pausedReason: '', changedAt: null, aiConfigured: true, model: 'gpt-4o-mini', baseUrl: 'https://upd.example' };
const templates = [
  { language: 'en', template: 'Hi {name}, {company} here. Our AI assistant has 3 quick questions for you: {link} Reply STOP to opt out.' },
  { language: 'ur', template: 'السلام علیکم {name}، {company} کی طرف سے۔ چند سوالات: {link}' },
];

function envelope(data: unknown, pagination?: Record<string, unknown>) {
  return { success: true, data, ...(pagination ? { pagination } : {}) };
}

async function respond(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'access-control-allow-origin': appOrigin,
      'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id',
      'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

const calls: { revoke: number; sessionQueries: string[] } = { revoke: 0, sessionQueries: [] };

async function installApiMocks(page: Page) {
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'e2e-refresh', url: appOrigin }]);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return respond(route, {});
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return respond(route, envelope({ accessToken: 'e2e-access', refreshToken: 'e2e-refresh' }));
    if (path === '/users/me') return respond(route, envelope({
      _id: 'user-e2e-1', firstName: 'Test', lastName: 'Administrator', email: 'admin@example.test',
      role: { name: 'Admin', permissions: ['lead:read', 'lead:write', 'ai-calling:read', 'ai-calling:write', 'ai-calling:admin'] },
    }));
    if (path === '/ai-calling/campaigns' && request.method() === 'GET') return respond(route, envelope([campaign], { page: 1, limit: 25, total: 1, pages: 1 }));
    if (path === '/ai-calling/campaigns/c-link') return respond(route, envelope(campaign));
    if (path === '/ai-calling/telephony/health') return respond(route, envelope({ ready: false, livekitReady: true, checks: [] }));
    if (path === '/ai-calling/agents') return respond(route, envelope({ agents: [], summary: { agents: 0, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 0 } }));
    if (path === '/ai-calling/analytics') return respond(route, envelope({
      campaigns: 1, totalCalls: 0, answered: 0, answerRate: null, qualified: 0, qualificationRate: null, callbacks: 0,
      avgCallSeconds: 0, totalCost: 0, reviews: 0, byDisposition: [], byQualification: [], byDay: [],
    }));
    if (path === '/ai-calling/settings/providers') return respond(route, envelope({
      primaryProvider: 'gemini', secondaryProvider: 'openai', primaryModel: 'gemini-test-live', secondaryModel: 'gpt-test-realtime', experimentalModel: '', geminiVoice: 'test-voice', fallbackEnabled: false,
      maxSessionSeconds: 60, maxCallCostUsd: 0, connectionTimeoutMs: 10000,
      credentials: { gemini: { stored: false, apiEnvironmentConfigured: false }, openai: { stored: false, apiEnvironmentConfigured: false } },
      health: { gemini: { status: 'unverified', scope: 'fixture', model: 'gemini-test-live' }, openai: { status: 'unverified', scope: 'fixture', model: 'gpt-test-realtime' } },
      pricing: {}, pricingVerifiedAt: 'test fixture',
    }));
    if (path === '/link-assistant/settings') return respond(route, envelope(settings));
    if (path === '/link-assistant/templates') return respond(route, envelope(templates));
    if (path === '/link-assistant/campaigns/c-link/analytics') return respond(route, envelope(analytics));
    if (path === '/link-assistant/sessions') {
      calls.sessionQueries.push(url.search);
      const status = url.searchParams.get('status');
      const rows = status ? sessions.filter((s) => s.status === status) : sessions;
      return respond(route, envelope(rows, { page: 1, limit: 25, total: rows.length, pages: 1 }));
    }
    if (path === '/link-assistant/sessions/s1') return respond(route, envelope(detail));
    if (path === '/link-assistant/sessions/s1/revoke') { calls.revoke += 1; return respond(route, envelope({ revoked: true })); }
    return respond(route, envelope([]));
  });
}

const noPageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page: Page, name: string) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` }); };

test.beforeEach(async ({ page }) => {
  calls.revoke = 0;
  calls.sessionQueries = [];
  await installApiMocks(page);
});

for (const width of [360, 768, 1440]) {
  test(`${width}px: link campaign results, conversations and transcript fit the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 800 : 900 });
    await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Connections', exact: true }).click();
    await expect(page.getByRole('region', { name: 'SMS link assistant status' })).toBeVisible();
    await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
    await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
  await page.getByText(campaign.name).first().click();
    await page.getByRole('tab', { name: 'SMS link chats' }).click();

    const funnel = page.getByRole('heading', { name: 'Funnel' }).locator('xpath=ancestor::section[1]');
    await expect(funnel).toContainText('Delivered');
    await expect(funnel).toContainText('55.3%'); // delivered 21 of 38 sent
    await expect(funnel).toContainText('68.4%'); // opened 26 of 38 sent (delivery reports are partial)
    await expect(funnel).not.toContainText('123.8%');
    await expect(page.getByRole('rowheader', { name: 'Monthly electricity bill' })).toBeVisible();
    await expect(page.getByText('Ayesha Textiles')).toBeVisible();
    expect(await noPageOverflow(page)).toBeLessThanOrEqual(0);
    await shot(page, `crm-panel-${width}`);

    await page.getByText(sessions[0].leadName).click();
    const sheet = page.getByRole('dialog', { name: /Bilal Traders/ });
    await expect(sheet.getByText('Installation ki qeemat kya hai?')).toBeVisible();
    await expect(sheet.getByText('AI-written')).toBeVisible();
    await expect(sheet.getByText('Delivered (carrier)')).toHaveCount(0); // never confirmed by the carrier
    // Wait for the slide-in animation to settle before measuring.
    await expect.poll(async () => { const b = await sheet.boundingBox(); return b ? b.x + b.width : Infinity; }).toBeLessThanOrEqual(width + 1);
    expect((await sheet.boundingBox())!.x).toBeGreaterThanOrEqual(0);
    await shot(page, `crm-conversation-${width}`);
  });
}

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
  test(`${width}×${height}: the AI calling page scrolls; no section is squeezed or clipped`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Calling Agents', exact: true })).toBeVisible();
    const header = page.locator('header').filter({ has: page.getByRole('heading', { name: 'Calling Agents' }) });
    for (const name of ['Create Agent']) {
      const button = header.getByRole('button', { name });
      await expect(button).toBeVisible();
      const [b, h] = [await button.boundingBox(), await header.boundingBox()];
      expect(b!.y + b!.height).toBeLessThanOrEqual(h!.y + h!.height); // inside the header, not cut off
    }
    // Every section of the workspace keeps its full height (the page scrolls instead).
    // (Measured from in-flow content; decorative absolutely-positioned glows may overflow on purpose.)
    const squeezed = await header.evaluate((el) => Array.from(el.parentElement!.children).filter((section) => {
      const box = section.getBoundingClientRect();
      const contentBottom = Math.max(box.top, ...Array.from(section.children)
        .filter((c) => getComputedStyle(c).position !== 'absolute')
        .map((c) => c.getBoundingClientRect().bottom));
      return contentBottom > box.bottom + 1;
    }).map((section) => section.textContent?.trim().slice(0, 40)));
    expect(squeezed).toEqual([]);
    await shot(page, `ai-calling-header-${width}x${height}`);
  });
}

test('agent test studio: the orb is centred and never overlaps the title', async ({ page }) => {
  // The studio tests voice campaigns: serve one next to the link campaign (registered later → wins).
  const voice = { ...campaign, _id: 'c-voice', id: 'c-voice', name: 'Voice demo', channel: 'voice', agentConfig: { ...campaign.agentConfig, agentName: 'Salman' } };
  await page.route((url) => url.pathname.endsWith('/api/v1/ai-calling/campaigns'), (route) => (route.request().method() === 'GET'
    ? respond(route, envelope([campaign, voice], { page: 1, limit: 25, total: 2, pages: 1 }))
    : route.fallback()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Test Studio', exact: true }).click();
  await page.getByRole('button', { name: /Open test studio|Set up a test/ }).first().click();
  const dialog = page.getByRole('dialog');
  const orb = dialog.getByRole('img', { name: 'Voice agent is idle' }).first();
  await expect(orb).toBeVisible();
  const title = dialog.getByText(/^Talk to /).first();
  await expect(title).toBeVisible();
  const [o, t] = [await orb.boundingBox(), await title.boundingBox()];
  expect(o!.y + o!.height).toBeLessThanOrEqual(t!.y + 1); // orb ends above the title
  expect(Math.abs((o!.x + o!.width / 2) - (t!.x + t!.width / 2))).toBeLessThan(4); // centred on the same axis
  await shot(page, 'agent-test-studio-1440');
});

test('status filter is applied by the server; revoking a link needs confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
  await page.getByText(campaign.name).first().click();
  await page.getByRole('tab', { name: 'SMS link chats' }).click();
  await page.getByRole('region', { name: 'Campaign details', exact: true }).getByRole('combobox', { name: 'Status' }).selectOption('completed');
  await expect(page.getByText(sessions[0].leadName)).toHaveCount(0);
  await expect(page.getByText('Ayesha Textiles')).toBeVisible();
  expect(calls.sessionQueries.some((q) => q.includes('status=completed'))).toBe(true);
  await page.getByRole('region', { name: 'Campaign details', exact: true }).getByRole('combobox', { name: 'Status' }).selectOption('');

  await page.getByText(sessions[0].leadName).click();
  await page.getByRole('button', { name: 'Revoke link' }).click();
  const confirm = page.getByRole('dialog', { name: 'Revoke this link?' });
  await expect(confirm).toBeVisible();
  await shot(page, 'crm-revoke-confirm');
  await confirm.getByRole('button', { name: 'Keep link' }).click();
  // Radix retains the closing dialog for its exit animation. Wait until its
  // identically named destructive button is removed before reopening.
  await expect(confirm).toHaveCount(0);
  expect(calls.revoke).toBe(0);
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await page.getByRole('dialog', { name: 'Revoke this link?' }).getByRole('button', { name: 'Revoke link' }).click();
  await expect.poll(() => calls.revoke).toBe(1);
});

for (const width of [360, 1440]) {
  test(`${width}px: SMS link campaign wizard validates inline, previews the SMS and guards unsaved work`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 800 : 900 });
    await page.goto('/ai-calling', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
    await page.getByRole('button', { name: 'Legacy / SMS campaign', exact: true }).click();
    const wizard = page.getByRole('dialog', { name: /New calling campaign|New SMS link campaign/ });
    await wizard.getByRole('radio', { name: /SMS link/ }).click();
    await wizard.getByRole('button', { name: 'Next' }).click();
    await expect(wizard.getByRole('alert')).toContainText('Give the campaign a name');

    await wizard.getByLabel('Campaign name').fill('Lahore solar follow-up');
    await wizard.getByRole('button', { name: 'Next' }).click();
    await expect(wizard.getByRole('alert')).toContainText('Describe the outcome');
    await wizard.getByLabel(/Objective \(for the AI/).fill('Qualify interest in a solar installation.');
    await wizard.getByRole('button', { name: 'Next' }).click();
    await wizard.getByRole('button', { name: 'Next' }).click();
    await expect(wizard.getByRole('alert')).toContainText('company name');
    await wizard.getByLabel(/Company name/).fill('Sunrise Solar');
    const preview = wizard.locator('figure');
    await expect(preview).toContainText('Hi Muhammad Ali, Sunrise Solar here.');
    await expect(preview).toContainText('1 SMS');
    expect(await noPageOverflow(page)).toBeLessThanOrEqual(0);
    const dialogBox = await wizard.boundingBox();
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width + 1);
    await shot(page, `crm-wizard-assistant-${width}`);

    await page.keyboard.press('Escape');
    const discard = page.getByRole('dialog', { name: 'Discard this campaign?' });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(wizard.getByLabel(/Company name/)).toHaveValue('Sunrise Solar');
  });
}
