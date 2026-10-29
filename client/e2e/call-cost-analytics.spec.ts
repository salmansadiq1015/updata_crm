import { expect, test, type Page } from '@playwright/test';

const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const tokens = { inputAudio: 10000, inputCachedAudio: 4000, inputText: 2000, inputCachedText: 0, outputAudio: 2500, outputText: 500, input: 12000, output: 3000, total: 15000 };
const data = {
  agent: { id: 'agent-ui', name: 'Aria' }, currency: 'USD',
  totals: { calls: 2, connected: 1, completed: 1, qualified: 1, leads: 1, totalCost: 0.3696, totalSeconds: 90, avgCostPerCall: 0.1848,
    avgCostPerConnectedCall: 0.3696, avgCostPerLead: 0.3696, costPerQualifiedLead: 0.3696, costPerMinute: 0.2464, avgDurationSeconds: 90,
    connectRate: 0.5, tokens, avgTokensPerCall: 15000, components: { model: 0.3696, telephony: 0, platform: 0, other: 0 },
    modelDetail: { audioIn: 0.1936, audioOut: 0.16, textIn: 0.008, textOut: 0.008 }, callsWithUsage: 1, callsWithoutCost: 0 },
  testing: { calls: 1, totalCost: 0.02, seconds: 30, tokens: 1000 },
  pricing: { telephonyRatePerMinute: 0, platformRatePerMinute: 0, model: 'gpt-realtime' },
  tone: { positive: 1, neutral: 0, hesitant: 0, negative: 0, unrecorded: 0 }, outcomes: { engaged: 1, not_reached: 1 },
  byDay: [{ date: '2026-10-28', calls: 1, connected: 0, cost: 0.1, seconds: 0, tokens: 0 }, { date: '2026-10-29', calls: 1, connected: 1, cost: 0.2696, seconds: 90, tokens: 15000 }],
  leads: [], calls: [], truncated: false,
  billing: { status: 'not_reconciled', timezone: 'UTC', currency: 'USD', from: null, to: null, modelEstimate: 0.3696, additionalEstimate: 0, unpricedCalls: 0, foreignCurrencyCalls: 0, excludes: ['input_transcription'] },
};

async function prepare(page: Page, report: unknown = data) {
  const agent = { _id: 'agent-ui', name: 'Aria', title: 'Customer Support', description: 'Collects contact information', availability: 'active', version: 1,
    agentConfig: { agentName: 'Aria', organizationName: 'Updata', voice: 'alloy', language: 'en' },
    questionnaire: { questions: [] }, statusRules: [], schedule: {}, transport: 'cloud_sip', assignedLeadIds: [],
    readiness: { ready: true, missing: [] }, eligibility: { total: 0, eligible: 0, excluded: 0, leads: [] },
    metrics: { campaigns: 0, activeCampaigns: 0, inProgress: 0, completed: 0, answered: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0 },
    latestCampaign: null, createdAt: '2026-10-29T09:00:00Z', updatedAt: '2026-10-29T09:00:00Z' };
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'cost-ui-fixture', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let result: unknown = [];
    if (path === '/auth/refresh') result = { accessToken: 'ui-fixture', refreshToken: 'ui-fixture' };
    else if (path === '/users/me') result = { _id: 'ui-owner', firstName: 'UI', lastName: 'Tester', role: { name: 'Reader', permissions: ['ai-calling:read', 'lead:read'] } };
    else if (path.endsWith('/call-analytics')) result = report;
    else if (path === '/ai-calling/agents') result = { agents: [agent], summary: { agents: 1, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 0 } };
    else if (path === '/ai-calling/agents/agent-ui') result = agent;
    else if (path === '/ai-calling/telephony/health') result = { configured: true, livekitReady: true };
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id' }, body: JSON.stringify({ success: true, data: result }) });
  });
  await page.goto('/ai-calling');
  await page.getByRole('button', { name: 'Open Aria', exact: true }).click();
  await page.getByRole('tab', { name: 'Call Analytics', exact: true }).click();
  await expect(page.getByText('Estimated call total', { exact: true })).toBeVisible();
}

for (const width of [390, 768, 1440]) {
  test(`cost chart stays inside its card at ${width}px and remains interactive`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await prepare(page);
    const card = page.getByRole('region', { name: 'Call cost trend' });
    await card.scrollIntoViewIfNeeded();
    for (const metric of ['Daily cost', 'Cumulative', 'Cost / min', 'Calls']) {
      await card.getByRole('radio', { name: metric, exact: true }).click();
      const svg = card.locator('svg[viewBox="0 0 1000 100"]');
      const bounds = await svg.boundingBox();
      const container = await card.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(container!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await card.getByRole('button', { name: '2026-10-29: 1', exact: true }).click();
    await expect(card.getByText(/1 call · 1 connected/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Billing comparison' })).toContainText('not reconciled with OpenAI billing');
    await page.screenshot({ path: `/private/tmp/updata-call-cost-${width}-${test.info().project.name}.png`, fullPage: true });
  });
}

test('cost plot remains bounded in RTL layout', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => document.documentElement.dir = 'rtl');
  const chart = page.getByTestId('cost-trend-plot');
  const svg = chart.locator('svg');
  const a = await chart.boundingBox(); const b = await svg.boundingBox();
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
});

test('historical calls without model identity are not presented as zero-dollar spend', async ({ page }) => {
  await prepare(page, { ...data, totals: { ...data.totals, totalCost: 0 }, billing: { ...data.billing, unpricedCalls: 1, modelEstimate: 0 } });
  await expect(page.getByText('Estimated call total').locator('..')).toContainText('Not recorded');
  const chart = page.getByRole('region', { name: 'Call cost trend' });
  await expect(chart).toContainText('Cost trend is unavailable');
  await chart.getByRole('radio', { name: 'Calls', exact: true }).click();
  await expect(chart.locator('svg[viewBox="0 0 1000 100"]')).toBeVisible();
});
