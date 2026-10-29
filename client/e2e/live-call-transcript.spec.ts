import { expect, test } from '@playwright/test';

// Mocked CRM responses only: this suite never starts or dials a phone call.
const origin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;
test('preview both speakers, live answers and final notes during a call', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('theme', 'dark'); });
  const campaign = {
    _id: 'live-campaign', name: 'Customer support outreach', status: 'running', runMode: 'immediate', transport: 'paired_phone', channel: 'voice',
    isTest: false, questionnaireVersion: 1, questionnaire: { questions: [] }, statusRules: [], agentConfig: { agentName: 'Aria' },
    schedule: { timezone: 'Asia/Karachi', maxConcurrency: 1 },
    summary: { total: 1, eligible: 1, queued: 0, inProgress: 1, completed: 0, qualified: 0, callbacks: 0, needsReview: 0, totalCallSeconds: 0, actualCost: 0 },
  };
  const turns = [
    { itemId: 'a1', role: 'assistant', text: 'How can we help your team?', at: new Date().toISOString() },
    { itemId: 'c1', role: 'customer', text: 'We need a quote for our office.', at: new Date().toISOString() },
  ];
  const call = {
    _id: 'live-call', internalCallId: 'internal-live', attemptNumber: 1, state: 'in_progress', disposition: null, qualification: null, durationSeconds: 0,
    initiatedAt: new Date(Date.now() - 45_000).toISOString(), answeredAt: new Date(Date.now() - 40_000).toISOString(), endedAt: null as string | null,
    provider: 'paired_phone', leadId: { _id: 'lead-one', name: 'Zafar Traders', phone: '+923001234567', email: 'office@example.test' },
    campaignId: { _id: campaign._id, name: campaign.name }, transcript: turns, reviewRequired: false,
    answers: [{ questionFieldKey: 'need', label: 'Service needed', rawAnswer: 'We need a quote for our office.', normalizedValue: 'Office quote', validation: 'valid', confirmed: false }],
    questionCoverage: { total: 2, applicable: 2, answered: 1, unknown: 0, needsClarification: 0, needsConfirmation: 0, unanswered: 1, notApplicable: 0, requiredGaps: ['callback'], questions: [
      { fieldKey: 'need', label: 'Service needed', question: 'How can we help your team?', required: true, eligible: true, status: 'answered', rawAnswer: 'We need a quote for our office.', normalizedValue: 'Office quote', validation: 'valid', confirmed: false, source: 'agent_tool' },
      { fieldKey: 'callback', label: 'Callback time', question: 'When should our team call you back?', required: true, eligible: true, status: 'pending', rawAnswer: '', normalizedValue: null, validation: null, confirmed: false, source: null },
    ] },
    conversationInsights: { version: 1, basis: 'recorded_evidence', intent: 'not_established', observations: [], nextSteps: ['Collect the callback time before concluding.'], participation: { agentTurns: 1, leadTurns: 1, interruptedAgentTurns: 0 }, limitation: 'Only recorded evidence is used.' },
    callContext: { agentName: 'Aria', objective: 'Understand the customer’s service needs.', phase: 'ask', answered: 1, total: 2, currentQuestion: 'When should our team call you back?', questions: [{ fieldKey: 'need', label: 'Service needed', text: 'How can we help your team?', required: true }] },
    agentActivity: { agentState: 'listening', speaker: 'customer', at: new Date().toISOString() },
    callNotes: { description: '', summary: '', blockers: [] as string[], source: 'ai_agent' },
  };
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'fixture', url: origin }]);
  let detailFailures = 4;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' } }); return; }
    let data: unknown = []; let pagination;
    if (path === '/auth/refresh') data = { accessToken: 'fixture', refreshToken: 'fixture' };
    else if (path === '/users/me') data = { _id: 'fixture-owner', firstName: 'UI', lastName: 'Tester', role: { name: 'Admin', permissions: ['ai-calling:read', 'ai-calling:write', 'ai-calling:admin'] } };
    else if (path === '/ai-calling/agents') data = { agents: [], summary: { agents: 0, activeCampaigns: 1, inProgress: 1, completed: 0, eligible: 1 } };
    else if (path === '/ai-calling/campaigns') { data = [campaign]; pagination = { page: 1, limit: 25, total: 1, pages: 1 }; }
    else if (path === '/ai-calling/campaigns/live-campaign') data = campaign;
    else if (path.endsWith('/run-status')) data = { status: 'running', runMode: 'immediate', pending: 0, inProgress: 1, blockers: [], waits: [], sequential: true, canStart: false };
    else if (path.endsWith('/active-calls')) data = call.endedAt ? [] : [{ ...call, recordId: call._id, callId: call.internalCallId, leadName: call.leadId.name, leadNumber: 'L-001', agentName: 'Aria', elapsedSeconds: 40, answered: 1, total: 2, currentQuestion: call.callContext.currentQuestion, transport: 'paired_phone', transcriptPreview: turns }];
    else if (path === '/ai-calling/calls/live-call/monitor') { await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': origin }, body: JSON.stringify({ success: false, error: { message: 'Live audio monitoring is not configured' } }) }); return; }
    else if (path === '/ai-calling/calls/live-call') { if (detailFailures-- > 0) { await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': origin }, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Temporary database interruption' } }) }); return; } data = call; }
    else if (path === '/ai-calling/settings') data = { voicePaused: false };
    else if (path === '/link-assistant/settings') data = { paused: false };
    else if (path === '/ai-calling/telephony/health') data = { configured: false, livekitReady: true, reachable: true };
    else if (path === '/ai-calling/analytics') data = { campaigns: 1, totalCalls: 1, answered: 1, byDisposition: [], byQualification: [], byDay: [] };
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' }, body: JSON.stringify({ success: true, data, ...(pagination ? { pagination } : {}) }) });
  });
  await page.goto('/ai-calling');
  await page.getByRole('tab', { name: 'Campaign History', exact: true }).click();
  await page.getByRole('button', { name: campaign.name, exact: true }).click();
  const campaignPanel = page.getByRole('region', { name: 'Campaign details', exact: true });
  await campaignPanel.getByRole('tab', { name: 'Live calls', exact: true }).click();
  await expect(campaignPanel.getByText(turns[0].text, { exact: true })).toBeVisible();
  await expect(campaignPanel.getByRole('button', { name: 'Listen to both voices' })).toBeVisible();
  if (process.env.LIVE_CALL_UI_SHOTS) await page.screenshot({ path: `${process.env.LIVE_CALL_UI_SHOTS}/live-panel-${test.info().project.name}.png` });
  await campaignPanel.getByRole('button', { name: 'Open transcript & full details', exact: true }).click();
  const preview = page.getByRole('dialog', { name: /Zafar Traders/ });
  await expect(preview.getByText(turns[1].text, { exact: true })).toBeVisible();
  await expect(preview.getByText('Aria', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Listen to both voices' }).click();
  await expect(preview.getByRole('alert')).toContainText('Live audio monitoring is not configured');
  await preview.getByRole('tab', { name: 'Answers', exact: true }).click();
  await expect(preview.getByRole('heading', { name: /Service needed/ })).toBeVisible();
  await expect(preview.getByText('Awaiting answer', { exact: true })).toBeVisible();
  await preview.getByRole('tab', { name: 'Insights', exact: true }).click();
  await expect(preview.getByText('Collect the callback time before concluding.', { exact: true })).toBeVisible();
  await preview.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(preview.getByText('+923001234567', { exact: true })).toBeVisible();
  await preview.getByRole('tab', { name: 'Transcript', exact: true }).click();
  turns.push({ itemId: 'a2', role: 'assistant', text: 'Thank you. Our team will follow up tomorrow.', at: new Date().toISOString() });
  await expect(preview.getByText(turns[2].text, { exact: true })).toBeVisible();
  // A long conversation must have one reachable viewport, including when the
  // drawer is nested inside campaign details on a small screen.
  for (let index = 0; index < 40; index++) turns.push({ itemId: `long-${index}`, role: index % 2 ? 'customer' : 'assistant', text: `Conversation turn ${index}: a complete response that wraps on a phone-sized screen.`, at: new Date().toISOString() });
  await expect(preview.getByText(turns.at(-1)!.text, { exact: true })).toBeInViewport();
  const scroll = preview.locator('[data-call-conversation-scroll]');
  const transcript = preview.getByRole('log');
  expect(await transcript.evaluate(node => getComputedStyle(node).overflowY)).not.toBe('auto');
  await scroll.evaluate(node => { node.scrollTop = 350; node.dispatchEvent(new Event('scroll')); });
  const readingPosition = await scroll.evaluate(node => node.scrollTop);
  turns.at(-1)!.text += ' The latest response was corrected.';
  await expect(preview.getByText(turns.at(-1)!.text, { exact: true })).toBeAttached();
  expect(await scroll.evaluate(node => node.scrollTop)).toBeCloseTo(readingPosition, 0);
  const jump = preview.getByRole('button', { name: 'Jump to latest' });
  await expect(jump).toBeInViewport();
  await jump.click();
  await expect(preview.getByText(turns.at(-1)!.text, { exact: true })).toBeInViewport();
  const dialogBounds = await preview.boundingBox();
  expect(dialogBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await preview.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  if (process.env.LIVE_CALL_UI_SHOTS) await page.screenshot({ path: `${process.env.LIVE_CALL_UI_SHOTS}/live-transcript-${test.info().project.name}.png` });
  call.state = 'completed'; call.endedAt = new Date().toISOString(); call.durationSeconds = 48;
  call.callNotes = { description: 'Office service enquiry', summary: 'Lead requested a quote and a follow-up tomorrow.', blockers: [], source: 'ai_agent' };
  await preview.getByText('Call ended', { exact: true }).scrollIntoViewIfNeeded();
  await expect(preview.getByText('Call ended', { exact: true })).toBeVisible();
  await preview.getByRole('tab', { name: 'Notes', exact: true }).click();
  await expect(preview.getByText('Lead requested a quote and a follow-up tomorrow.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(campaignPanel).toBeVisible();
});
