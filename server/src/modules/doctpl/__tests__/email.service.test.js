import {
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

const mockEmailRecordCreate = jest.fn();
const mockQueueAddJob = jest.fn();
const mockEventPublish = jest.fn();
const mockCiFindOne = jest.fn();

jest.unstable_mockModule('../emailRecord.repository.js', () => ({
  default: {
    create: mockEmailRecordCreate,
    findById: jest.fn(),
    findWithCursor: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockQueueAddJob },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: mockEventPublish },
}));

jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { DOCTPL_EMAIL_QUEUED: 'doctpl.email.queued' },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../ciConfiguration.model.js', () => ({
  default: { findOne: mockCiFindOne },
}));

let emailService;

function ciQuery(result) {
  return {
    select: jest.fn(() => ({
      lean: jest.fn(async () => result),
    })),
  };
}

function emailInput(overrides = {}) {
  return {
    to: ['customer@example.com'],
    subject: 'Offerte OFF-1',
    bodyHtml: '<p>Hello</p>',
    sourceModule: 'qop',
    sourceRecordId: '507f1f77bcf86cd799439011',
    createdBy: '507f1f77bcf86cd799439012',
    ...overrides,
  };
}

beforeAll(async () => {
  emailService = (await import('../email.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.COMPANY_EMAIL;
  delete process.env.SMTP_MAIL;
  delete process.env.SMTP_FROM_NAME;
});

describe('emailService.send sender identity', () => {
  test('defaults sender from the active CI company email', async () => {
    mockCiFindOne.mockReturnValue(ciQuery({
      companyName: 'Updata',
      companyDetails: { email: 'company@example.com' },
    }));
    mockEmailRecordCreate.mockImplementation(async (payload) => ({ _id: 'email-1', ...payload }));

    await emailService.send(emailInput());

    expect(mockEmailRecordCreate).toHaveBeenCalledWith(expect.objectContaining({
      senderAddress: 'company@example.com',
      senderName: 'Updata',
    }));
    expect(mockQueueAddJob).toHaveBeenCalledWith('email-dispatch', 'email-email-1', { emailRecordId: 'email-1' });
  });

  test('preserves explicit sender overrides without loading CI config', async () => {
    mockEmailRecordCreate.mockImplementation(async (payload) => ({ _id: 'email-2', ...payload }));

    await emailService.send(emailInput({
      senderAddress: 'sales@example.com',
      senderName: 'Sales Team',
    }));

    expect(mockCiFindOne).not.toHaveBeenCalled();
    expect(mockEmailRecordCreate).toHaveBeenCalledWith(expect.objectContaining({
      senderAddress: 'sales@example.com',
      senderName: 'Sales Team',
    }));
  });

  test('uses the configured email brand instead of the document company name', async () => {
    process.env.SMTP_FROM_NAME = 'Updata.ai';
    mockCiFindOne.mockReturnValue(ciQuery({
      companyName: 'Legal Document Company',
      companyDetails: { email: 'company@example.com' },
    }));
    mockEmailRecordCreate.mockImplementation(async (payload) => ({ _id: 'email-3', ...payload }));

    await emailService.send(emailInput());

    expect(mockEmailRecordCreate).toHaveBeenCalledWith(expect.objectContaining({
      senderAddress: 'company@example.com',
      senderName: 'Updata.ai',
    }));
  });
});
