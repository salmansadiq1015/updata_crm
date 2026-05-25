import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import ERROR_CODES from '../../src/shared/errors/errorCodes.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let widgetSubmissionService;
let WidgetConfig;
let WidgetSubmission;
let Customer;
let Contact;
let EntityNote;
let Permission;
let Role;
let User;

const validPayload = {
  widgetId: 'mb-main',
  contact: {
    name: 'Muster Kunde',
    email: 'KUNDE@example.test',
    phone: '+41 44 000 00 00',
    address: {
      street: 'Bahnhofstrasse 1',
      zip: '8001',
      city: 'Zuerich',
    },
  },
  requestType: 'wartung',
  description: 'Bitte die Heizungsanlage im Keller pruefen.',
  preferredWindow: 'Montag Vormittag',
  language: 'de',
};

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/permission.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/user.model.js');
  WidgetConfig = (await import('../../src/modules/integrations/widgetConfig.model.js')).default;
  WidgetSubmission = (await import('../../src/modules/integrations/widgetSubmission.model.js')).default;
  Customer = (await import('../../src/modules/crm/customer.model.js')).default;
  Contact = (await import('../../src/modules/crm/contact.model.js')).default;
  EntityNote = (await import('../../src/modules/crm/entityNote.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  widgetSubmissionService = (await import('../../src/modules/integrations/widgetSubmission.service.js')).default;
});

afterEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await disconnectTestDb();
});

let counter = 0;
function seq() {
  counter += 1;
  return counter;
}

async function seedDispatcher() {
  const permission = await Permission.create({
    module: 'scheduling',
    action: 'read',
    description: 'Read scheduling queue',
  });
  const role = await Role.create({ name: `Dispatcher_${seq()}`, permissions: [permission._id] });
  return User.create({
    email: `dispatcher${seq()}@example.test`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Dispatch',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

describe('widgetSubmissionService', () => {
  test('maps public widget payload into the submission model contract', async () => {
    await seedDispatcher();
    await WidgetConfig.create({
      widgetId: 'mb-main',
      confirmationMessageDe: 'Danke, wir melden uns.',
      rateLimitPerHour: 20,
    });

    const result = await widgetSubmissionService.submit(validPayload, {
      ipAddress: '203.0.113.10',
      userAgent: 'jest',
    });

    expect(result.referenceNumber).toMatch(/^WEB-\d{4}-\d{6}$/);
    expect(result.confirmationMessage).toBe('Danke, wir melden uns.');

    const saved = await WidgetSubmission.findById(result.submissionId).lean();
    expect(saved).toMatchObject({
      widgetId: 'mb-main',
      contactName: 'Muster Kunde',
      contactEmail: 'kunde@example.test',
      contactPhone: '+41 44 000 00 00',
      requestType: 'wartung',
      description: validPayload.description,
      preferredWindow: 'Montag Vormittag',
      language: 'de',
      processingStatus: 'pending',
      ipAddress: '203.0.113.10',
    });
    expect(saved.contactAddress).toMatchObject({
      street: 'Bahnhofstrasse 1',
      zip: '8001',
      city: 'Zuerich',
    });

    const customer = await Customer.findOne({ email: 'kunde@example.test' }).lean();
    const contact = await Contact.findOne({ email: 'kunde@example.test' }).lean();
    const note = await EntityNote.findOne({ entityType: 'customer', entityId: customer._id }).lean();

    expect(customer).toMatchObject({
      name: 'Muster Kunde',
      type: 'private',
      postalCode: '8001',
      city: 'Zuerich',
    });
    expect(contact).toMatchObject({
      customerId: customer._id,
      firstName: 'Muster',
      lastName: 'Kunde',
      isPrimary: true,
    });
    expect(String(saved.crmContactId)).toBe(String(contact._id));
    expect(note.text).toContain(result.referenceNumber);
  });

  test('blocks duplicate submissions from the same email and request type within one hour', async () => {
    await widgetSubmissionService.submit(validPayload, {
      ipAddress: '203.0.113.11',
      userAgent: 'jest',
    });

    await expect(widgetSubmissionService.submit(validPayload, {
      ipAddress: '203.0.113.11',
      userAgent: 'jest',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.WIDGET_SUBMISSION_DUPLICATE,
    });

    await expect(WidgetSubmission.countDocuments()).resolves.toBe(1);
  });

  test('enforces configured per-IP submission rate limit', async () => {
    await WidgetConfig.create({
      widgetId: 'mb-main',
      rateLimitPerHour: 1,
    });

    await widgetSubmissionService.submit(validPayload, {
      ipAddress: '203.0.113.12',
      userAgent: 'jest',
    });

    await expect(widgetSubmissionService.submit({
      ...validPayload,
      contact: { ...validPayload.contact, email: 'second@example.test' },
      description: 'Eine andere Anfrage fuer denselben Anschluss.',
    }, {
      ipAddress: '203.0.113.12',
      userAgent: 'jest',
    })).rejects.toMatchObject({
      statusCode: 429,
      code: ERROR_CODES.WIDGET_RATE_LIMIT_EXCEEDED,
    });
  });

  test('uses nested captcha config and stores successful captcha score', async () => {
    await WidgetConfig.create({
      widgetId: 'mb-main',
      captcha: {
        provider: 'recaptcha_v3',
        secretKey: 'captcha-secret',
        threshold: 0.5,
      },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ success: true, score: 0.91 }),
    });

    const result = await widgetSubmissionService.submit({
      ...validPayload,
      captchaToken: 'captcha-token',
    }, {
      ipAddress: '203.0.113.13',
      userAgent: 'jest',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const saved = await WidgetSubmission.findById(result.submissionId).lean();
    expect(saved.captchaScore).toBe(0.91);
  });
});
