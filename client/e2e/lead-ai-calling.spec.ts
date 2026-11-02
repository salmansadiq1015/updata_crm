import { expect, test } from '@playwright/test';
import { makeLeadDTO } from '../src/modules/leads/__tests__/mocks/data';

const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;

test('assigns an AI agent from a lead, retains the assignment, and opens the agent workspace', async ({ page }) => {
  const lead = makeLeadDTO({ id: 'lead-ui', name: 'Loftfitness', source: 'manual', leadNumber: 'L-00862' });
  let agent = {
    _id: 'agent-ui', name: 'Sarah Sales', title: 'Sales Qualification Agent', description: 'Qualifies leads for your sales team.', availability: 'active', version: 3,
    agentConfig: { agentName: 'Sarah Sales', organizationName: 'Updata', voice: 'coral', language: 'en', disclosure: 'I am an AI assistant.', objective: 'Qualify interest' },
    questionnaire: { questions: [] }, statusRules: [],
    schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '17:00' }, daysOfWeek: [1, 2, 3, 4, 5] },
    assignedLeadIds: ['existing-lead'], avatarUrl: null, readiness: { ready: true, missing: [] },
    eligibility: { total: 1, found: 1, unavailable: 0, eligible: 1, reasonCounts: {}, leads: [] },
    metrics: { campaigns: 0, activeCampaigns: 0, completed: 0, answered: 0, inProgress: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0 },
    latestCampaign: null, lastActiveAt: null, createdAt: '2026-11-01T09:00:00Z', updatedAt: '2026-11-01T09:00:00Z',
  };
  const assignments: Record<string, unknown>[] = [];
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'ui-fixture', url: origin }]);
  await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); });
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'ui-fixture', refreshToken: 'ui-fixture' };
    else if (path === '/users/me') data = { _id: 'ui-owner', firstName: 'UI', lastName: 'Tester', email: 'ui@example.test', role: { name: 'Reader', permissions: ['ai-calling:read', 'ai-calling:write', 'lead:read', 'lead:write', 'crm:read'] } };
    else if (path === '/crm/leads/filter-options') data = { countries: [], cities: [], areas: [], businessTypes: [], types: [] };
    else if (path === '/crm/leads') { data = [lead]; pagination = { hasNext: false, nextCursor: null, limit: 25, total: 1 }; }
    else if (path === `/crm/leads/${lead.id}`) data = lead;
    else if (path === '/ai-calling/agents') { data = { agents: [agent], summary: {} }; pagination = { page: 1, limit: 100, total: 1, pages: 1 }; }
    else if (path === '/ai-calling/agents/agent-ui/leads') {
      const input = request.postDataJSON(); assignments.push(input);
      agent = { ...agent, assignedLeadIds: [...new Set([...agent.assignedLeadIds, ...input.leadIds])], version: agent.version + 1 };
      data = agent;
    } else if (path === '/ai-calling/agents/agent-ui') data = agent;
    else if (path === '/ai-calling/telephony/health') data = { configured: true, eligible: true };
    await route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' },
      body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }),
    });
  });
  await page.goto(`/leads?detail=${lead.id}`);
  const drawer = page.getByRole('dialog', { name: 'Loftfitness' });
  await drawer.getByRole('button', { name: 'AI call', exact: true }).click();
  await expect(drawer.getByRole('tab', { name: 'AI Calls', exact: true })).toHaveAttribute('aria-selected', 'true');
  const sections = drawer.getByRole('tablist', { name: 'Lead detail sections' });
  await expect(sections.getByRole('tab')).toHaveCount(9);
  const tabRows = await sections.getByRole('tab').evaluateAll(tabs => new Set(tabs.map(tab => Math.round(tab.getBoundingClientRect().top))).size);
  expect(tabRows).toBe(1);
  await drawer.getByRole('button', { name: 'More lead sections' }).click();
  await expect.poll(() => sections.evaluate(list => Math.abs(list.scrollLeft))).toBeGreaterThan(0);
  await drawer.getByRole('tab', { name: 'Details', exact: true }).focus();
  await expect(drawer.getByRole('tab', { name: 'Details', exact: true })).toBeInViewport();
  await drawer.getByRole('button', { name: 'AI call', exact: true }).click();
  await expect(drawer.getByRole('tab', { name: 'AI Calls', exact: true })).toBeInViewport();
  await expect(drawer.getByRole('combobox', { name: 'Calling agent' })).toBeVisible();
  await page.screenshot({ path: `/tmp/updata-lead-ai-unassigned-${test.info().project.name}.png`, animations: 'disabled' });
  await drawer.getByRole('combobox', { name: 'Calling agent' }).click();
  await page.getByRole('option', { name: /Sarah Sales/ }).click();
  await drawer.getByRole('button', { name: 'Assign agent', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'Open agent' })).toBeVisible();
  expect(assignments).toEqual([{ leadIds: ['lead-ui'], version: 3, mode: 'add' }]);
  expect(agent.assignedLeadIds).toEqual(['existing-lead', 'lead-ui']);
  await page.reload();
  await drawer.getByRole('button', { name: 'AI call', exact: true }).click();
  await expect(drawer.getByText('Sarah Sales', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/updata-lead-ai-assigned-${test.info().project.name}.png`, animations: 'disabled' });
  await drawer.getByRole('link', { name: 'Open agent' }).click();
  await expect(page).toHaveURL(/\/ai-calling\?agent=agent-ui$/);
  await expect(page.getByRole('heading', { name: 'Sarah Sales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Calling Agents', exact: true }).click();
  await expect(page).toHaveURL(/\/ai-calling$/);
  await expect(page.getByRole('button', { name: 'Open Sarah Sales' })).toBeVisible();
});
