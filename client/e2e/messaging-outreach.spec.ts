import { expect, test, type Page, type Route } from '@playwright/test';

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT || 3000}`;

const campaign = {
  _id: 'campaign-e2e-1',
  name: 'October customer follow-up',
  description: 'Approved contacts in Switzerland',
  channel: 'sms',
  purpose: 'promotional',
  status: 'completed',
  createdAt: '2026-10-13T08:00:00.000Z',
  summary: {
    total: 6, eligible: 6, ineligible: 0, draft: 0, queued: 0, submitting: 0,
    accepted: 1, sent: 1, delivered: 2, read: 0, failed: 1, undelivered: 1,
    unknown: 0, cancelled: 0, suppressed: 0, missingContact: 0, invalidContact: 0,
    duplicate: 0, optedOut: 0,
  },
  monitoring: {
    progress: { eligible: 6, processed: 6, pending: 0, queued: 0, inFlight: 0, percent: 100 },
    schedule: { state: 'completed', scheduledAt: null, timezone: 'Europe/Zurich', dueInSeconds: null },
    throughput: { processedPerMinute: 12, estimatedSecondsRemaining: 0 },
    largeAudience: false,
    refreshedAt: '2026-10-13T08:05:00.000Z',
  },
};

const settings = {
  providers: { emailEnabled: true, metaWhatsappEnabled: true, textbeeEnabled: true, twilioEnabled: true },
  smsFallback: { enabled: true, allowedCountries: ['CH'], allowedPurposes: ['promotional'], dailySpendLimit: 10, monthlySpendLimit: 100 },
  countryRouting: { textbeeAllowedCountries: ['CH'], twilioAllowedCountries: ['CH'], whatsappAllowedCountries: ['CH'] },
  quotas: { daily: 500, monthly: 10000, perCampaign: 2000 },
  quietHours: { enabled: true, start: '20:00', end: '08:00', timezone: 'Europe/Zurich' },
  frequencyLimits: {
    enabled: true, purposes: ['promotional'],
    email: { minIntervalHours: 24, dailyMax: 1, weeklyMax: 3 },
    sms: { minIntervalHours: 24, dailyMax: 1, weeklyMax: 2 },
    whatsapp: { minIntervalHours: 24, dailyMax: 1, weeklyMax: 2 },
  },
  regionalQuietHours: [],
  pricing: {
    currency: 'CHF', textbeeCarrierPerSegment: 0.08, twilioDefaultPerSegment: 0.1,
    metaMarketingPerMessage: 0.06, metaUtilityPerMessage: 0.03, metaServicePerMessage: 0,
  },
};

const analytics = {
  campaigns: 1, activeCampaigns: 0, totalRecipients: 6, submitted: 6, delivered: 2,
  read: 0, emailBounced: 0, fallbackCount: 1, inboundReplies: 1,
  deliveryRate: 1 / 3, readRate: 0, emailBounceRate: 0,
  byStatus: [{ _id: 'delivered', count: 2 }, { _id: 'failed', count: 1 }],
  byChannel: [{ _id: 'sms', count: 6, submitted: 6, delivered: 2, read: 0, failed: 1, bounced: 0 }],
  byProvider: [{ _id: 'textbee', count: 5, submitted: 5, delivered: 2, read: 0, failed: 1, costs: [{ currency: 'CHF', actual: 0, estimated: 0.4 }] }],
  quotas: settings.quotas,
  usage: { daily: 6, monthly: 48 },
  compliance: { frequencyBlocked: 1, expiringConsents: 0, expiredConsents: 0, suppressedDestinations: 2 },
  queue: { waiting: 0, active: 0, failed: 0, delayed: 0 },
};

const health = {
  settings,
  providers: {
    email: { configured: true, reachable: true, eligible: true },
    metaWhatsapp: { configured: true, reachable: true, eligible: true },
    textbee: { configured: true, reachable: true, eligible: true, device: { status: 'online' } },
    twilio: { configured: true, reachable: true, eligible: true },
  },
  operations: {
    checkedAt: '2026-10-13T08:05:00.000Z',
    snapshots: {},
    unknown: { count: 0, oldestAt: null },
    pendingReconciliation: 0,
    recentErrors: [],
    queue: { waiting: 0, active: 0, completed: 6, failed: 0, delayed: 0 },
    readiness: {
      ready: true,
      counts: { pass: 8, warn: 0, fail: 0 },
      checks: [{ id: 'queue', label: 'Background queue', status: 'pass', detail: 'Redis and BullMQ are reachable.' }],
    },
  },
};

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

async function installApiMocks(page: Page) {
  let lead = {
    _id: 'lead-e2e-contact',
    id: 'lead-e2e-contact',
    leadNumber: 'L-E2E-22',
    name: 'Basel Dental GmbH',
    type: 'business',
    status: 'new',
    source: 'manual',
    address: { street: null, area: null, postalCode: '4051', city: 'Basel', canton: 'BS', country: 'CH' },
    phone: null,
    mobile: null,
    email: null,
    website: null,
    location: null,
    providerMeta: { rating: null, reviewCount: null, priceLevel: null },
    sourceMetadata: { businessType: 'dentist', discoveredAt: null },
    tags: [],
    assignedTo: null,
    createdBy: 'user-e2e-1',
    createdAt: '2026-10-13T08:00:00.000Z',
    updatedAt: '2026-10-13T08:00:00.000Z',
  };
  await page.context().addCookies([{ name: 'mb_refresh_token', value: 'e2e-refresh', url: appOrigin }]);
  // Match the API path rather than a fixed host so the suite remains valid
  // when NEXT_PUBLIC_API_URL points at a developer or CI backend origin.
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return respond(route, {});

    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return respond(route, envelope({ accessToken: 'e2e-access', refreshToken: 'e2e-refresh' }));
    if (path === '/users/me') return respond(route, envelope({
      _id: 'user-e2e-1', firstName: 'Test', lastName: 'Administrator', email: 'admin@example.test',
      role: { name: 'Admin', permissions: ['lead:read', 'lead:write', 'crm:write', 'crm:admin', 'settings:read', 'settings:admin'] },
    }));
    if (path === '/users/directory') return respond(route, envelope([
      { _id: 'user-e2e-1', id: 'user-e2e-1', firstName: 'Test', lastName: 'Administrator', email: 'admin@example.test' },
    ]));
    if (path === '/crm/leads/filter-options') return respond(route, envelope({
      countries: [{ id: 'country:CH', value: 'Switzerland', code: 'CH', count: 1 }],
      cities: [], areas: [], types: [{ value: 'business', count: 1 }], businessTypes: [{ value: 'dentist', count: 1 }],
    }));
    if (path === '/crm/leads' && request.method() === 'GET') {
      return respond(route, envelope([lead], { hasNext: false, nextCursor: null, limit: 25, total: 1 }));
    }
    if (path === `/crm/leads/${lead.id}` && request.method() === 'PATCH') {
      const patch = request.postDataJSON() as Record<string, unknown>;
      lead = { ...lead, ...patch, updatedAt: '2026-10-13T08:06:00.000Z' };
      return respond(route, envelope(lead));
    }
    if (path === '/messaging/campaigns') return respond(route, envelope([campaign], { page: 1, limit: 25, total: 1, pages: 1 }));
    if (path === `/messaging/campaigns/${campaign._id}/recipients`) return respond(route, envelope([
      {
        _id: 'recipient-e2e-1', leadId: { _id: 'lead-e2e-1', leadNumber: 'L-E2E-1', name: 'Alpine Dental' },
        channel: 'sms', status: 'delivered', provider: 'textbee', providerMessageId: 'textbee-e2e-1',
        destination: '+41790000000', createdAt: '2026-10-13T08:01:00.000Z',
      },
    ], { page: 1, limit: 25, total: 1, pages: 1 }));
    if (path === `/messaging/campaigns/${campaign._id}/retry-eligibility`) return respond(route, envelope({
      status: 'all', candidates: 2, retryable: 1, blocked: { ambiguous: 0, permanent: 1 }, generatedAt: '2026-10-13T08:05:00.000Z',
    }));
    if (path === '/messaging/templates') return respond(route, envelope([
      {
        _id: 'template-e2e-1', name: 'Friendly follow-up', channel: 'email', purpose: 'promotional',
        category: 'lead_follow_up', description: 'A concise follow-up for opted-in leads.', createdBy: 'user-e2e-1', isShared: true,
        subject: 'Following up', bodyText: 'Hello {{firstName}}',
      },
    ]));
    if (path === '/messaging/analytics') return respond(route, envelope(analytics));
    if (path === '/messaging/settings/health') return respond(route, envelope(health));

    return respond(route, envelope([]));
  });
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test('renders campaign evidence and owns a working vertical scroll region', async ({ page }) => {
  await page.goto('/leads/outreach', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Outreach center' })).toBeVisible();
  await expect(page.getByText('October customer follow-up')).toBeVisible();
  await page.getByText('October customer follow-up').click();
  await expect(page.getByText('Alpine Dental')).toBeVisible();

  const scrollContainer = page.getByTestId('outreach-scroll-container');
  await expect(scrollContainer).toHaveCSS('overflow-y', 'auto');
  const dimensions = await scrollContainer.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  await scrollContainer.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => scrollContainer.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('switches between templates and evidence-based analytics', async ({ page }) => {
  await page.goto('/leads/outreach', { waitUntil: 'domcontentloaded' });

  await page.getByRole('tab', { name: 'Templates' }).click();
  await expect(page.getByText('Template library')).toBeVisible();
  await expect(page.getByText('Friendly follow-up')).toBeVisible();

  await page.getByRole('tab', { name: 'Analytics' }).click();
  await expect(page.getByText('Usage and compliance')).toBeVisible();
  await expect(page.getByText('Provider outcomes and cost')).toBeVisible();
  await expect(page.getByText('33% · 2/6 submitted')).toBeVisible();
});

test('renders the credential-safe provider control center', async ({ page }) => {
  await page.goto('/admin/messaging', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Messaging control center' })).toBeVisible();
  await expect(page.getByText('Deployment preflight')).toBeVisible();
  await expect(page.getByText('100%')).toBeVisible();
  await expect(page.getByText('Meta WhatsApp Cloud API')).toBeVisible();
  await expect(page.getByText('TextBee SMS gateway')).toBeVisible();
  await expect(page.getByText('Twilio SMS fallback')).toBeVisible();
  await expect(page.getByText('Authorized test send')).toBeVisible();
  await expect(page.getByText(/No token, password, API key, or secret value/)).toBeVisible();
});

test('adds validated email and phone details from the leads table', async ({ page }) => {
  await page.goto('/leads', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Phone' })).toBeVisible();
  await page.getByRole('button', { name: 'Add email for Basel Dental GmbH' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contact details for Basel Dental GmbH' });
  const email = dialog.getByLabel('Email');
  const phone = dialog.getByLabel('Phone', { exact: true });
  const save = dialog.getByRole('button', { name: 'Save' });

  await email.fill('not-an-email');
  await expect(dialog.getByText('Enter a valid email address')).toBeVisible();
  await expect(save).toBeDisabled();

  await email.fill('Hello@Basel.CH');
  await phone.fill('12345');
  await expect(dialog.getByText(/Enter a valid phone number/)).toBeVisible();
  await expect(save).toBeDisabled();

  await phone.fill('+41 61 555 01 02');
  await expect(save).toBeEnabled();
  await save.click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Hello@basel.ch')).toBeVisible();
  await expect(page.getByText('+41 61 555 01 02')).toBeVisible();
});
