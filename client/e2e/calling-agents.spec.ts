import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Browser integration fixtures only. The backend suite separately exercises
// the real routes, database, dispatch engine and recovery with mocked providers.
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
const premiumAvatars = JSON.parse(readFileSync(`${__dirname}/../assets/agent-avatars/generation-prompts.json`, 'utf8')).avatars.map((avatar: { id: string; name: string; category: string; description: string }) => ({ ...avatar, _id: `preset:${avatar.id}`, presetId: avatar.id, url: `/avatars/agents/${avatar.id}-v1.webp`, thumbnailUrl: `/avatars/agents/${avatar.id}-thumb-v1.webp` }));
const initial = () => ({
  _id: 'agent-ui', name: 'Sarah Sales', title: 'Sales Qualification Agent', description: 'Qualifies leads and captures key information for your sales team.', availability: 'active', version: 1,
  agentConfig: { agentName: 'Sarah Sales', organizationName: 'Updata', voice: 'coral', language: 'en', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest' },
  questionnaire: { questions: [{ fieldKey: 'interest', label: 'Interest', text: 'Would you like a callback?', type: 'boolean', required: true, order: 1 }] }, statusRules: [],
  schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '17:00' }, daysOfWeek: [1, 2, 3, 4, 5], maxConcurrency: 1 },
  transport: 'cloud_sip', assignedLeadIds: ['lead-ui'], avatarFileId: null, avatarPresetId: null as string | null, avatarUrl: null as string | null, readiness: { ready: true, missing: [] },
  eligibility: { total: 1, found: 1, unavailable: 0, eligible: 1, reasonCounts: {}, leads: [{ leadId: 'lead-ui', name: 'Acme customer', status: 'new', phone: '+923001234567', eligible: true, reasons: [] }] },
  metrics: { campaigns: 0, activeCampaigns: 0, inProgress: 0, completed: 0, answered: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0 }, latestCampaign: null, lastActiveAt: null,
  createdAt: '2026-10-28T09:00:00Z', updatedAt: '2026-10-28T09:00:00Z',
});
async function prepare(page: Page, readOnly = false, events?: { assignments: Record<string, unknown>[]; leadQueries: Record<string, string>[] }) {
  let agent = initial();
  const launches: Record<string, unknown>[] = [];
  let campaign: Record<string, unknown> | null = null;
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'ui-fixture', url: origin }]);
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/api/v1', '');
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'ui-fixture', refreshToken: 'ui-fixture' };
    else if (path === '/users/me') data = { _id: 'ui-owner', firstName: 'UI', lastName: 'Tester', email: 'ui@example.test', role: { name: 'Reader', permissions: readOnly ? ['ai-calling:read'] : ['ai-calling:read', 'ai-calling:write', 'ai-calling:admin', 'lead:read', 'lead:write', 'crm:read'] } };
    else if (path === '/ai-calling/agents' && req.method() === 'POST') { agent = { ...agent, ...req.postDataJSON(), _id: 'created-agent' }; data = agent; }
    else if (path === '/ai-calling/agents') { data = { agents: [agent], summary: { agents: 1, activeCampaigns: 0, inProgress: 0, completed: 0, eligible: 1 } }; pagination = { page: 1, limit: 24, total: 1, pages: 1 }; }
    else if (/\/agents\/[^/]+\/launch$/.test(path)) {
      const input = req.postDataJSON(); launches.push(input);
      campaign = { ...agent, _id: 'campaign-ui', name: 'Sarah outreach', status: input.mode === 'scheduled' ? 'scheduled' : 'running', runMode: input.mode === 'scheduled' ? 'scheduled' : 'immediate', agentId: agent._id, agentSnapshot: { name: agent.name, title: agent.title, version: agent.version }, questionnaireVersion: 1, scheduledAt: input.scheduledAt, waitReason: 'calling_hours', summary: { total: 1, eligible: 1, queued: 1, inProgress: 0, completed: 0, answered: 0, noAnswer: 0, qualified: 0, unqualified: 0, callbacks: 0, needsReview: 0, failed: 0, totalCallSeconds: 0 } }; data = campaign;
    } else if (/\/agents\/[^/]+\/leads$/.test(path)) { const input = req.postDataJSON(); events?.assignments.push(input); agent = { ...agent, assignedLeadIds: input.mode === 'add' ? [...new Set([...agent.assignedLeadIds, ...input.leadIds])] : input.leadIds, version: agent.version + 1 }; data = agent; }
    else if (/\/agents\/[^/]+$/.test(path)) { if (req.method() === 'PATCH') agent = { ...agent, ...req.postDataJSON(), version: agent.version + 1, avatarUrl: req.postDataJSON().avatarPresetId ? `/avatars/agents/${req.postDataJSON().avatarPresetId}-v1.webp` : null }; data = agent; }
    else if (path === '/ai-calling/agent-avatar-presets') data = premiumAvatars;
    else if (path === '/ai-calling/campaigns') { data = campaign ? [campaign] : []; pagination = { page: 1, limit: 25, total: campaign ? 1 : 0, pages: 1 }; }
    else if (path === '/ai-calling/campaigns/campaign-ui') data = campaign;
    else if (path.endsWith('/run-status')) data = { status: campaign?.status, pending: 1, inProgress: 0, canStart: false, blockers: [], waits: [{ code: 'calling_hours', message: 'Waiting for permitted calling hours. Starting now does not bypass calling hours or recipient quiet hours.' }], nextAt: '2030-11-04T04:00:00Z', displayStatus: 'waiting' };
    else if (path === '/ai-calling/languages') data = { languages: [{ code: 'en', name: 'English', nativeName: 'English', support: 'full' }], defaultLanguage: 'en' };
    else if (path === '/ai-calling/recipients/preview') data = agent.eligibility;
    else if (path === '/ai-calling/telephony/health') data = { configured: true, livekitReady: true, eligible: true, reachable: true };
    else if (path === '/ai-calling/settings') data = { voicePaused: false };
    else if (path === '/link-assistant/settings') data = { paused: false };
    else if (path === '/crm/leads/filter-options') data = { countries: [{ id: 'country:PK', value: 'Pakistan', code: 'PK', count: 2 }], cities: [], areas: [], businessTypes: [], types: [] };
    else if (path === '/crm/leads') { events?.leadQueries.push(Object.fromEntries(new URL(req.url()).searchParams)); data = [{ _id: 'lead-ui', name: 'Acme customer', source: 'manual', status: 'new', phone: '+923001234567' }, { _id: 'lead-second', name: 'Second customer', source: 'manual', status: 'new', phone: '+923009876543' }]; pagination = { hasNext: false, nextCursor: null, total: 2 }; }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' }, body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }) });
  });
  await page.goto('/ai-calling');
  await expect(page.getByRole('button', { name: 'Open Sarah Sales' })).toBeVisible();
  return launches;
}

test('agent gallery, workspace tabs, lead assignment, immediate launch and truthful waiting state', async ({ page }) => {
  const launches = await prepare(page);
  await expect(page.getByRole('heading', { name: 'Calling Agents', exact: true })).toBeVisible();
  await expect(page.getByText('Paired phones', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Sarah Sales' }).click();
  await page.getByRole('tab', { name: 'Questions', exact: true }).click();
  await expect(page.getByLabel('Question 1 text')).toHaveValue('Would you like a callback?');
  await page.getByRole('tab', { name: 'Leads', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Second customer', exact: true }).check();
  await page.getByRole('button', { name: 'Review 2 assignments' }).click();
  await page.getByRole('button', { name: 'Confirm assignments' }).click();
  await expect(page.getByRole('button', { name: 'Review 2 assignments' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Start Campaign', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start Campaign', exact: true });
  await expect(dialog.getByLabel(/Launch date and time/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Start Now', exact: true }).click();
  await expect.poll(() => launches.length).toBe(1);
  expect(launches[0]).toMatchObject({ mode: 'now', scheduledAt: null, continueAcrossDays: false });
  const details = page.getByRole('region', { name: 'Campaign details', exact: true });
  await expect(details.getByText(/Waiting for permitted calling hours/)).toBeVisible();
  await details.getByRole('tab', { name: 'Configuration', exact: true }).click();
  await expect(details.getByText('Saved campaign configuration', { exact: true })).toBeVisible();
  await expect(details.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.screenshot({ path: `/tmp/updata-agent-workspace-${test.info().project.name}.png`, fullPage: true });
});

test('draft agent creation and future scheduled launch use separate flows', async ({ page }) => {
  const launches = await prepare(page);
  await page.getByRole('button', { name: 'Create Agent', exact: true }).click();
  await page.screenshot({ path: `/tmp/updata-create-agent-spacing-${test.info().project.name}.png`, fullPage: true });
  await page.getByLabel('Agent name *', { exact: true }).fill('Support agent');
  await page.getByLabel('Title / role', { exact: true }).fill('Support Specialist');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Support agent', exact: true })).toBeVisible();
  expect(launches).toHaveLength(0);
  await page.getByRole('button', { name: 'Back to Calling Agents', exact: true }).click();
  await page.getByRole('button', { name: 'Open Support agent', exact: true }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Agent availability', { exact: true }).selectOption('active');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Start Campaign', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start Campaign', exact: true });
  await dialog.getByRole('radio', { name: /Schedule Campaign/ }).check();
  await dialog.getByLabel(/Launch date and time/).fill('2030-11-04T09:15');
  await dialog.getByRole('button', { name: 'Schedule Campaign', exact: true }).click();
  await expect.poll(() => launches.length).toBe(1);
  expect(launches[0].mode).toBe('scheduled');
});

test('read-only gallery disables configuration and launch actions', async ({ page }) => {
  const launches = await prepare(page, true);
  await expect(page.getByRole('button', { name: 'Create Agent', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start Campaign', exact: true })).toBeDisabled();
  expect(launches).toHaveLength(0);
  await page.screenshot({ path: `/tmp/updata-agent-gallery-${test.info().project.name}.png`, fullPage: true });
});


test('premium avatar artwork loads, filters, previews and persists across a page reload', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Open Sarah Sales' }).click();
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Choose avatar' }).click();
  const gallery = page.getByRole('dialog', { name: 'Image gallery' });
  await expect(gallery.getByRole('button', { name: /^Preview / })).toHaveCount(16);
  await expect.poll(() => gallery.getByAltText('Aria', { exact: true }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
  await gallery.getByRole('button', { name: 'AI companions' }).click();
  await expect(gallery.getByRole('button', { name: /^Preview / })).toHaveCount(6);
  await gallery.getByRole('button', { name: 'All', exact: true }).click();
  await gallery.getByRole('button', { name: 'Preview Maya' }).click();
  await expect.poll(() => gallery.getByAltText('Avatar preview').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
  await page.screenshot({ path: `/tmp/updata-premium-avatars-${test.info().project.name}.png`, fullPage: true });
  await gallery.getByRole('button', { name: 'Use as avatar' }).click();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Open Sarah Sales' }).click();
  await expect(page.locator('header img[src="/avatars/agents/maya-v1.webp"]')).toBeVisible();
});


test('creation includes searchable, filtered lead assignment and saves selected leads with the draft', async ({ page }) => {
  const events = { assignments: [] as Record<string, unknown>[], leadQueries: [] as Record<string, string>[] };
  const launches = await prepare(page, false, events);
  await page.getByRole('button', { name: 'Create Agent', exact: true }).click();
  await page.getByLabel('Agent name *', { exact: true }).fill('Assigned support agent');
  await page.getByRole('tab', { name: '4 · Assign leads' }).click();
  await page.getByLabel('Search leads', { exact: true }).fill('customer');
  await page.getByLabel('Lead source', { exact: true }).selectOption('manual');
  await page.getByLabel('Country', { exact: true }).selectOption('country:PK');
  await expect.poll(() => events.leadQueries.some(query => query.q === 'customer' && query.source === 'manual' && query.countryId === 'country:PK')).toBe(true);
  await page.getByRole('button', { name: 'Select shown', exact: true }).click();
  await expect(page.getByText('2 / 500 selected', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/updata-create-agent-leads-${test.info().project.name}.png`, fullPage: true });
  const created = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ai-calling/agents'));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await created).postDataJSON().assignedLeadIds).toEqual(['lead-ui', 'lead-second']);
  await expect(page.getByRole('heading', { name: 'Assigned support agent', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Assigned support agent' })).toBeVisible();
  expect(launches).toHaveLength(0);
});

for (const mode of ['single', 'bulk'] as const) test(`Leads page ${mode} assignment adds to the chosen agent and preserves previous assignments`, async ({ page }) => {
  const events = { assignments: [] as Record<string, unknown>[], leadQueries: [] as Record<string, string>[] };
  const launches = await prepare(page, false, events);
  await page.goto('/leads');
  const second = page.getByRole('row').filter({ hasText: 'Second customer' });
  await expect(second).toBeVisible();
  if (mode === 'single') {
    await second.getByRole('button', { name: 'Row actions' }).click();
    await page.getByRole('menuitem', { name: 'Assign to calling agent' }).click();
  } else {
    await second.getByRole('checkbox').check();
    await page.getByRole('row').filter({ hasText: 'Acme customer' }).getByRole('checkbox').check();
    await page.getByRole('region', { name: 'Bulk actions' }).getByRole('button', { name: 'Assign to agent', exact: true }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Assign leads to agent' });
  await dialog.getByRole('radio', { name: 'Select Sarah Sales' }).click();
  await expect(dialog.getByText(/2 total after assignment/)).toBeVisible();
  await page.screenshot({ path: `/tmp/updata-leads-${mode}-assignment-${test.info().project.name}.png`, fullPage: true });
  await dialog.getByRole('button', { name: mode === 'single' ? 'Assign 1 lead' : 'Assign 2 leads', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(events.assignments).toHaveLength(1);
  expect(events.assignments[0]).toMatchObject({ mode: 'add', version: 1 });
  expect(events.assignments[0].leadIds).toEqual(mode === 'single' ? ['lead-second'] : expect.arrayContaining(['lead-second', 'lead-ui']));
  await page.goto('/ai-calling');
  await page.getByRole('button', { name: 'Assign leads to Sarah Sales' }).click();
  await expect(page.getByRole('tab', { name: 'Leads', exact: true })).toHaveAttribute('data-state', 'active');
  expect(launches).toHaveLength(0);
});
