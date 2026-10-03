import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// LEAD-variable rendering against the real data layer (EmailBodyTemplate, Lead
// and CIConfiguration models + the real renderer), so what is asserted is the
// actual regex substitution, not a mock's idea of it. Only the peripheral deps
// the service imports at load time are mocked — the renderer uses none of them,
// and mocking keeps the test free of Redis / audit writes.
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: (_key, fn) => fn(), del: jest.fn() },
}));
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let mongod;
let EmailBodyTemplate;
let Lead;
let CIConfiguration;
let emailTemplateService;
let premiumEmailTemplates;

// Every variable the renderer promises to resolve. None of these may ever be
// left as a raw {{token}} in rendered output.
const ALLOWLISTED = [
  'businessName', 'contactName', 'businessType', 'city', 'address',
  'website', 'phone', 'email',
  'senderName', 'senderTitle', 'senderEmail', 'companyName',
];
const ALLOWLISTED_TOKEN = new RegExp(`\\{\\{\\s*(${ALLOWLISTED.join('|')})\\s*\\}\\}`);
const ANY_TOKEN = /\{\{\s*\w+\s*\}\}/;

const SENDER = {
  firstName: 'Ada', lastName: 'Lovelace', email: 'ada@updata.ch', title: 'Account Manager',
};

let leadSeq = 0;
async function makeLead(overrides = {}) {
  leadSeq += 1;
  return Lead.create({
    leadNumber: `L-${String(leadSeq).padStart(5, '0')}`,
    name: 'Müller Bäckerei AG',
    address: { street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich' },
    phone: '044 123 45 67',
    email: 'info@mueller.ch',
    website: 'https://mueller.ch',
    sourceMetadata: { businessType: 'Bakery' },
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  EmailBodyTemplate = (await import('../emailBodyTemplate.model.js')).default;
  Lead = (await import('../../crm/lead.model.js')).default;
  CIConfiguration = (await import('../ciConfiguration.model.js')).default;
  emailTemplateService = (await import('../emailTemplate.service.js')).default;
  premiumEmailTemplates = (await import('../../../migrations/data/premiumEmailTemplates.js')).default;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    EmailBodyTemplate.deleteMany({}),
    Lead.deleteMany({}),
    CIConfiguration.deleteMany({}),
  ]);
});

describe('emailTemplateService.render — LEAD variables', () => {
  it('resolves lead + sender variables and leaves no unresolved token', async () => {
    const lead = await makeLead();
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-lead-all',
      language: 'en',
      subjectTemplate: 'Hello {{businessName}}',
      bodyHtml: '<p>{{businessName}} in {{city}} ({{businessType}}) at {{address}}. '
        + 'Web {{website}}, tel {{phone}}, mail {{email}}. '
        + 'From {{senderName}} — {{senderTitle}} ({{senderEmail}}), {{companyName}}.</p>',
      bodyText: '{{businessName}} / {{city}} / {{senderName}}',
    });

    const out = await emailTemplateService.render(tpl._id, { leadId: lead._id, user: SENDER });

    expect(out.subject).toBe('Hello Müller Bäckerei AG');
    expect(out.bodyHtml).toContain('Müller Bäckerei AG in Zürich (Bakery)');
    expect(out.bodyHtml).toContain('at Bahnhofstrasse 1, 8001 Zürich');
    expect(out.bodyHtml).toContain('Web https://mueller.ch, tel 044 123 45 67, mail info@mueller.ch');
    expect(out.bodyHtml).toContain('From Ada Lovelace — Account Manager (ada@updata.ch), Updata.');
    expect(out.bodyText).toBe('Müller Bäckerei AG / Zürich / Ada Lovelace');

    // Nothing allowlisted — in fact nothing at all — is left as a raw token.
    for (const part of [out.subject, out.bodyHtml, out.bodyText]) {
      expect(part).not.toMatch(ANY_TOKEN);
    }
  });

  it('falls the phone back to mobile and contactName back to the business name', async () => {
    const lead = await makeLead({ phone: null, mobile: '079 000 11 22' });
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-lead-fallbacks',
      language: 'en',
      subjectTemplate: 'x',
      bodyHtml: 'phone=[{{phone}}] contact=[{{contactName}}]',
      bodyText: '',
    });

    const out = await emailTemplateService.render(tpl._id, { leadId: lead._id, user: SENDER });

    // Lead has no ownerName, so contactName falls back to the business name.
    expect(out.bodyHtml).toBe('phone=[079 000 11 22] contact=[Müller Bäckerei AG]');
  });

  it('empties UNRESOLVED allowlisted tokens but leaves NON-allowlisted tokens verbatim', async () => {
    // Documented rule: every allowlisted key is seeded (default ''), so an
    // allowlisted token always substitutes — to its value or '' when unset —
    // while an unknown token is left exactly as written.
    const lead = await makeLead({ sourceMetadata: { businessType: null }, website: null });
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-rule',
      language: 'en',
      subjectTemplate: 'x',
      bodyHtml: 'type=[{{businessType}}] web=[{{website}}] unknown=[{{unknownToken}}] sender=[{{senderName}}]',
      bodyText: '',
    });

    const out = await emailTemplateService.render(tpl._id, { leadId: lead._id, user: SENDER });

    expect(out.bodyHtml).toBe('type=[] web=[] unknown=[{{unknownToken}}] sender=[Ada Lovelace]');
    expect(out.bodyHtml).not.toMatch(ALLOWLISTED_TOKEN); // allowlisted ones all gone
    expect(out.bodyHtml).toMatch(/\{\{unknownToken\}\}/); // non-allowlisted preserved
  });

  it('seeds all allowlisted keys so a template renders empty (never raw) with no context', async () => {
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-empty',
      language: 'en',
      subjectTemplate: '{{businessName}}',
      bodyHtml: '[{{businessName}}][{{city}}][{{companyName}}]',
      bodyText: '',
    });

    const out = await emailTemplateService.render(tpl._id, { user: {} });

    // companyName defaults to the house name; the lead vars resolve to ''.
    expect(out.subject).toBe('');
    expect(out.bodyHtml).toBe('[][][Updata]');
  });

  it('resolves companyName from the active CI configuration', async () => {
    await CIConfiguration.create({ companyName: 'Updata AG', isActive: true });
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-ci',
      language: 'en',
      subjectTemplate: '{{companyName}}',
      bodyHtml: '{{companyName}}',
      bodyText: '',
    });

    const out = await emailTemplateService.render(tpl._id, { user: {} });

    expect(out.subject).toBe('Updata AG');
    expect(out.bodyHtml).toBe('Updata AG');
  });

  it('does not let a lead override an explicit customer context', async () => {
    const lead = await makeLead();
    const tpl = await EmailBodyTemplate.create({
      templateType: 'test-precedence',
      language: 'en',
      subjectTemplate: 'x',
      bodyHtml: 'business=[{{businessName}}]',
      bodyText: '',
    });

    // A (non-existent) customerId is enough to signal customer context; the lead
    // block is skipped, so businessName stays empty rather than the lead name.
    const out = await emailTemplateService.render(tpl._id, {
      customerId: new mongoose.Types.ObjectId(),
      leadId: lead._id,
      user: SENDER,
    });

    expect(out.bodyHtml).toBe('business=[]');
  });
});

describe('007_premium_email_templates — seeded templates', () => {
  it('upserts all six templates (en + de) idempotently, each rendering token-free', async () => {
    const { up } = await import('../../../migrations/007_premium_email_templates.js');
    await up();
    await up(); // re-run must refresh in place, never duplicate

    const all = await EmailBodyTemplate.find({ templateType: /^lead-/ }).lean();
    expect(all).toHaveLength(premiumEmailTemplates.length * 2); // 6 x {en, de}

    const slugs = [...new Set(all.map((t) => t.templateType))].sort();
    expect(slugs).toEqual([
      'lead-business-proposal',
      'lead-follow-up',
      'lead-introduction',
      'lead-meeting-request',
      'lead-partnership',
      'lead-service-introduction',
    ]);
    expect(all.every((t) => t.isActive === true)).toBe(true);

    const lead = await makeLead();
    for (const tpl of all) {
      const out = await emailTemplateService.render(tpl._id, { leadId: lead._id, user: SENDER });
      for (const part of [out.subject, out.bodyHtml, out.bodyText]) {
        expect(part).not.toMatch(ALLOWLISTED_TOKEN);
        expect(part).not.toMatch(ANY_TOKEN);
      }
      expect(out.bodyHtml).toContain('Müller Bäckerei AG'); // greeting resolved
      expect(out.bodyHtml.toLowerCase()).toContain('<!doctype html>'); // full document
      expect(out.bodyHtml).not.toMatch(/<script/i); // EJS-free / no scripts
      expect(out.bodyHtml).not.toMatch(/<style/i); // inline styles only
    }
  }, 30000);

  it('keeps every seeded body within the model maxlength caps', () => {
    for (const tpl of premiumEmailTemplates) {
      for (const lang of ['en', 'de']) {
        expect(tpl[lang].subject.length).toBeLessThanOrEqual(500);
        expect(tpl[lang].bodyHtml.length).toBeLessThanOrEqual(50000);
        expect(tpl[lang].bodyText.length).toBeLessThanOrEqual(20000);
      }
    }
  });
});
