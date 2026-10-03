import {
  jest, describe, it, beforeAll, beforeEach, expect,
} from '@jest/globals';

/**
 * Lead website-enrichment tests.
 *
 *  - HttpCheerioScraper.extractContacts: parses emails / phones / socials and
 *    drops noise, from a sample HTML string (no network).
 *  - HttpCheerioScraper.scrapeSite: with a MOCKED httpClient — merges a second
 *    (contact) page, honours the ≤2 page cap, and skips on a robots.txt Disallow.
 *  - leadEnrichmentService.enrichLead: fills ONLY missing fields (never
 *    overwrites), records enrichment metadata, and survives a dead site.
 *  - leadEnrichmentService bulk: enqueues a job and the worker body updates counts.
 *
 * axios/httpClient and the BullMQ queue are mocked; no real network or Redis.
 */

// ── Mock registrations (before importing the service under test) ───────────────

const mockGetById = jest.fn();
const mockUpdate = jest.fn();
jest.unstable_mockModule('../lead.repository.js', () => ({
  default: { getById: mockGetById, update: mockUpdate },
}));

const mockJobCreate = jest.fn();
const mockJobFindById = jest.fn();
const mockJobFindByIdAndUpdate = jest.fn();
const mockJobFindOne = jest.fn();
const LEAD_ENRICHMENT_JOB_STATUS = {
  QUEUED: 'QUEUED', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', PARTIAL: 'PARTIAL', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
};
jest.unstable_mockModule('../leadEnrichmentJob.model.js', () => ({
  default: {
    create: mockJobCreate,
    findById: mockJobFindById,
    findByIdAndUpdate: mockJobFindByIdAndUpdate,
    findOne: mockJobFindOne,
  },
  LEAD_ENRICHMENT_JOB_STATUS,
}));

const mockAddJob = jest.fn();
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockAddJob },
}));

const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let leadEnrichmentService;
let HttpCheerioScraper;

beforeAll(async () => {
  leadEnrichmentService = (await import('../leadEnrichment.service.js')).default;
  // Real scraper class (its own module is NOT mocked).
  HttpCheerioScraper = (await import('../../businessDiscovery/engine/websiteScraper.js')).HttpCheerioScraper;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Build an httpClient whose .get resolves a canned HTML/text response.
function htmlResponse(data, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  return { status, data, headers: { 'content-type': contentType } };
}

// ── extractContacts ───────────────────────────────────────────────────────────

describe('HttpCheerioScraper.extractContacts', () => {
  let scraper;
  beforeAll(() => { scraper = new HttpCheerioScraper({ httpClient: { get: jest.fn() } }); });

  const SAMPLE_HTML = `
    <html><body>
      <a href="mailto:info@acme.ch">Email us</a>
      <a href="mailto:logo@2x.png">noise</a>
      <a href="tel:+41 44 123 45 67">Call</a>
      <p>Sales: sales@acme.ch — phone 044 987 65 43</p>
      <p>Placeholder: office@example.com (ignore me)</p>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
      <a href="https://www.facebook.com/acme">Facebook</a>
      <a href="https://instagram.com/acme/">Instagram</a>
      <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
      <a href="https://x.com/acme">X</a>
      <a href="https://youtube.com/@acme">YouTube</a>
      <a href="https://www.tiktok.com/@acme">TikTok</a>
    </body></html>`;

  it('parses mailto + inline emails, lowercased and deduped, dropping noise', () => {
    const { emails } = scraper.extractContacts(SAMPLE_HTML, 'https://acme.ch/');
    expect(emails).toEqual(expect.arrayContaining(['info@acme.ch', 'sales@acme.ch']));
    expect(emails).not.toContain('logo@2x.png'); // asset filename
    expect(emails).not.toContain('office@example.com'); // placeholder domain
  });

  it('parses tel + inline phones into valid E.164', () => {
    const { phones } = scraper.extractContacts(SAMPLE_HTML, 'https://acme.ch/');
    expect(phones).toEqual(expect.arrayContaining(['+41441234567', '+41449876543']));
  });

  it('picks the first real profile link per network and ignores share widgets', () => {
    const { social } = scraper.extractContacts(SAMPLE_HTML, 'https://acme.ch/');
    expect(social).toEqual({
      facebook: 'https://www.facebook.com/acme',
      instagram: 'https://instagram.com/acme/',
      linkedin: 'https://www.linkedin.com/company/acme',
      twitter: 'https://x.com/acme',
      youtube: 'https://youtube.com/@acme',
      tiktok: 'https://www.tiktok.com/@acme',
    });
  });
});

// ── scrapeSite (mocked httpClient) ────────────────────────────────────────────

describe('HttpCheerioScraper.scrapeSite', () => {
  it('fetches a contact page when the homepage has no email, merges, and caps at 2 pages', async () => {
    const homepage = `
      <html><body>
        <p>Call 044 123 45 67</p>
        <a href="https://facebook.com/acme">FB</a>
        <a href="/kontakt">Kontakt</a>
      </body></html>`;
    const contact = '<html><body><a href="mailto:info@acme.ch">info@acme.ch</a></body></html>';

    const get = jest.fn(async (url) => {
      if (url.includes('/kontakt')) return htmlResponse(contact);
      return htmlResponse(homepage);
    });
    const scraper = new HttpCheerioScraper({ httpClient: { get }, config: { respectRobots: false } });

    const result = await scraper.scrapeSite('https://acme.ch/');

    expect(result.pagesFetched).toBe(2);
    expect(result.emails).toContain('info@acme.ch'); // from the contact page
    expect(result.phones).toContain('+41441234567'); // merged from the homepage
    expect(result.social.facebook).toBe('https://facebook.com/acme');
    expect(get).toHaveBeenCalledTimes(2); // homepage + one contact page — never a 3rd
  });

  it('does not fetch a second page when the homepage already has an email', async () => {
    const homepage = '<html><body><a href="mailto:hi@acme.ch">hi</a><a href="/about">About</a></body></html>';
    const get = jest.fn(async () => htmlResponse(homepage));
    const scraper = new HttpCheerioScraper({ httpClient: { get }, config: { respectRobots: false } });

    const result = await scraper.scrapeSite('https://acme.ch/');

    expect(result.pagesFetched).toBe(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.emails).toContain('hi@acme.ch');
  });

  it('skips the site when robots.txt disallows the path (no page fetched)', async () => {
    const get = jest.fn(async (url) => {
      if (url.includes('robots.txt')) return htmlResponse('User-agent: *\nDisallow: /\n', { contentType: 'text/plain' });
      return htmlResponse('<html><body>should not be fetched</body></html>');
    });
    const scraper = new HttpCheerioScraper({ httpClient: { get }, config: { respectRobots: true } });

    const result = await scraper.scrapeSite('https://blocked.example/');

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('robots_disallow');
    expect(result.pagesFetched).toBe(0);
    // Only robots.txt was requested — the homepage was never fetched.
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain('/robots.txt');
  });

  it('allows the path when robots.txt permits it', async () => {
    const get = jest.fn(async (url) => {
      if (url.includes('robots.txt')) return htmlResponse('User-agent: *\nDisallow: /private\n', { contentType: 'text/plain' });
      return htmlResponse('<html><body><a href="mailto:hi@ok.example">hi</a></body></html>');
    });
    const scraper = new HttpCheerioScraper({ httpClient: { get }, config: { respectRobots: true } });

    const result = await scraper.scrapeSite('https://ok.example/');

    expect(result.skipped).toBeUndefined();
    expect(result.pagesFetched).toBe(1);
    expect(result.emails).toContain('hi@ok.example');
  });
});

// ── enrichLead (fill-missing only) ────────────────────────────────────────────

describe('leadEnrichmentService.enrichLead', () => {
  const fakeScraper = (scrapeResult) => ({ scrapeSite: jest.fn(async () => scrapeResult) });

  it('fills ONLY missing fields and records done enrichment metadata', async () => {
    mockGetById.mockResolvedValue({
      _id: 'lead-1', website: 'https://acme.ch', email: null, phone: null, normalizedPhone: null, social: {},
    });
    mockUpdate.mockResolvedValue({ _id: 'lead-1' });

    const scraper = fakeScraper({
      emails: ['info@acme.ch'],
      phones: ['+41441234567'],
      social: { facebook: 'https://facebook.com/acme' },
      pagesFetched: 1,
    });

    const result = await leadEnrichmentService.enrichLead('lead-1', 'user-1', {}, { scraper });

    // First update = running marker; second = the fill + metadata.
    expect(mockUpdate.mock.calls[0][1]).toEqual({ 'enrichment.status': 'running' });
    const payload = mockUpdate.mock.calls[1][1];
    expect(payload).toMatchObject({
      email: 'info@acme.ch',
      phone: '+41441234567',
      normalizedPhone: '+41441234567',
      'social.facebook': 'https://facebook.com/acme',
      'enrichment.status': 'done',
      'enrichment.source': 'website',
      'enrichment.error': null,
    });
    expect(payload['enrichment.foundEmails']).toEqual(['info@acme.ch']);

    expect(result.applied).toEqual({ email: 'info@acme.ch', phones: ['+41441234567'], socials: ['facebook'] });
    expect(result.enriched).toBe(true);
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.enriched', module: 'lead' }));
  });

  it('never overwrites an existing email / phone / social', async () => {
    mockGetById.mockResolvedValue({
      _id: 'lead-2',
      website: 'https://acme.ch',
      email: 'existing@acme.ch',
      phone: '+41440000000',
      normalizedPhone: '+41440000000',
      social: { facebook: 'https://facebook.com/existing' },
    });
    mockUpdate.mockResolvedValue({ _id: 'lead-2' });

    const scraper = fakeScraper({
      emails: ['scraped@acme.ch'],
      phones: ['+41441234567'],
      social: { facebook: 'https://facebook.com/scraped' },
      pagesFetched: 1,
    });

    const result = await leadEnrichmentService.enrichLead('lead-2', 'user-1', {}, { scraper });

    const payload = mockUpdate.mock.calls[1][1];
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('normalizedPhone');
    expect(payload).not.toHaveProperty('social.facebook');
    // Still records what was found (idempotent refresh) and completes.
    expect(payload['enrichment.status']).toBe('done');
    expect(payload['enrichment.foundEmails']).toEqual(['scraped@acme.ch']);
    expect(result.applied).toEqual({ email: null, phones: [], socials: [] });
    expect(result.enriched).toBe(false);
  });

  it('marks enrichment failed on a dead site WITHOUT throwing', async () => {
    mockGetById.mockResolvedValue({
      _id: 'lead-3', website: 'https://dead.example', email: null, phone: null, normalizedPhone: null, social: {},
    });
    mockUpdate.mockResolvedValue({ _id: 'lead-3' });

    const scraper = fakeScraper({
      emails: [], phones: [], social: {}, pagesFetched: 0, error: 'fetch_failed:0:ECONNREFUSED',
    });

    const result = await leadEnrichmentService.enrichLead('lead-3', 'user-1', {}, { scraper });

    const payload = mockUpdate.mock.calls[1][1];
    expect(payload['enrichment.status']).toBe('failed');
    expect(payload['enrichment.error']).toContain('ECONNREFUSED');
    expect(payload).not.toHaveProperty('email');
    expect(result.failed).toBe(true);
    expect(result.applied).toEqual({ email: null, phones: [], socials: [] });
  });

  it('throws 400 when the lead has no website', async () => {
    mockGetById.mockResolvedValue({ _id: 'lead-4', website: null });
    await expect(leadEnrichmentService.enrichLead('lead-4', 'user-1', {}))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ── bulk enqueue + job run (counts) ───────────────────────────────────────────

describe('leadEnrichmentService.enrichLeadsBulk', () => {
  it('creates a job doc, enqueues the worker, and returns its id', async () => {
    mockJobCreate.mockResolvedValue({ _id: 'job-9' });

    const result = await leadEnrichmentService.enrichLeadsBulk(['l1', 'l2', 'l2'], 'user-1', {});

    expect(mockJobCreate).toHaveBeenCalledWith(expect.objectContaining({
      createdBy: 'user-1',
      leadIds: ['l1', 'l2'], // deduped
      status: 'QUEUED',
      counts: { total: 2 },
    }));
    expect(mockAddJob).toHaveBeenCalledWith('lead-enrichment', 'lead-enrichment-job-9', {
      enrichmentJobId: 'job-9', createdBy: 'user-1',
    });
    expect(result).toEqual({ jobId: 'job-9' });
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.bulk_enrich_queued' }));
  });
});

describe('leadEnrichmentService.runEnrichmentJob', () => {
  it('enriches each lead in the job and finalizes PARTIAL with per-outcome counts', async () => {
    mockJobFindById.mockReturnValue({
      lean: async () => ({ _id: 'job-1', createdBy: 'user-1', leadIds: ['l1', 'l2', 'l3'] }),
    });
    mockJobFindByIdAndUpdate.mockResolvedValue({});

    // Each lead lives on a distinct host (so the politeness throttle never waits).
    const leads = {
      l1: {
        _id: 'l1', website: 'https://a1.example', email: null, phone: null, normalizedPhone: null, social: {},
      },
      l2: {
        _id: 'l2', website: 'https://a2.example', email: null, phone: null, normalizedPhone: null, social: {},
      },
      l3: {
        _id: 'l3', website: 'https://a3.example', email: null, phone: null, normalizedPhone: null, social: {},
      },
    };
    mockGetById.mockImplementation(async (id) => leads[id]);
    mockUpdate.mockResolvedValue({});

    const scraper = {
      scrapeSite: jest.fn(async (url) => {
        if (url.includes('a1')) return { emails: ['x@a1.example'], phones: [], social: {}, pagesFetched: 1 };
        if (url.includes('a2')) {
          return {
            emails: [], phones: [], social: {}, pagesFetched: 0, skipped: true, reason: 'robots_disallow',
          };
        }
        return { emails: [], phones: [], social: {}, pagesFetched: 0, error: 'fetch_failed:0' };
      }),
    };

    const summary = await leadEnrichmentService.runEnrichmentJob('job-1', { scraper, politeDelayMs: 0 });

    expect(summary).toMatchObject({
      status: 'PARTIAL', processed: 3, enriched: 1, skipped: 1, failed: 1,
    });

    // The final job write carries the terminal status + partitioned counts.
    const finalCall = mockJobFindByIdAndUpdate.mock.calls.find((c) => c[1].status && c[1].completedAt);
    expect(finalCall[1]).toMatchObject({
      status: 'PARTIAL',
      'counts.processed': 3,
      'counts.enriched': 1,
      'counts.skipped': 1,
      'counts.failed': 1,
    });
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.bulk_enrich_completed' }));
  });
});
