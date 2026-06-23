import {
  afterEach,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

const mockEmailFindById = jest.fn();
const mockEmailFindByIdAndUpdate = jest.fn();
const mockSendMail = jest.fn();
const mockEventPublish = jest.fn();

jest.unstable_mockModule('../../shared/queue/BaseWorker.js', () => ({
  BaseWorker: class BaseWorker {
    constructor(name) { this.name = name; }
    async process(_job) { throw new Error('process() not implemented'); }
    getHandler() { return async (job) => this.process(job); }
  },
}));

jest.unstable_mockModule('../../shared/events/EventBus.js', () => ({
  default: { publish: mockEventPublish },
}));

jest.unstable_mockModule('../../shared/events/eventTypes.js', () => ({
  default: {
    DOCTPL_EMAIL_SENT: 'doctpl.email.sent',
    DOCTPL_EMAIL_FAILED: 'doctpl.email.failed',
  },
}));

jest.unstable_mockModule('../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../../modules/doctpl/emailRecord.model.js', () => ({
  default: {
    findById: mockEmailFindById,
    findByIdAndUpdate: mockEmailFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule('../../shared/mail/mail.js', () => ({
  default: mockSendMail,
}));

let EmailDispatchWorker;
let EMAIL_DISPATCH_MAX_ATTEMPTS;

beforeAll(async () => {
  const mod = await import('../emailDispatch.job.js');
  EmailDispatchWorker = mod.EmailDispatchWorker;
  EMAIL_DISPATCH_MAX_ATTEMPTS = mod.EMAIL_DISPATCH_MAX_ATTEMPTS;
});

afterEach(() => {
  jest.clearAllMocks();
});

function emailRecord(overrides = {}) {
  return {
    _id: 'email-1',
    to: ['customer@example.com'],
    cc: [],
    bcc: [],
    subject: 'Offerte OFF-1',
    senderName: 'MB Boiler',
    senderAddress: 'sales@example.com',
    bodyHtml: '<p>Hello</p>',
    bodyText: 'Hello',
    attachments: [],
    ...overrides,
  };
}

function job(overrides = {}) {
  return {
    data: { emailRecordId: 'email-1' },
    attemptsMade: 0,
    opts: { attempts: EMAIL_DISPATCH_MAX_ATTEMPTS },
    ...overrides,
  };
}

describe('EmailDispatchWorker', () => {
  test('sends email and marks the record as SENT', async () => {
    mockEmailFindById.mockResolvedValue(emailRecord());
    mockSendMail.mockResolvedValue({ messageId: 'smtp-1' });
    const worker = new EmailDispatchWorker();

    await expect(worker.process(job())).resolves.toEqual({ sent: true, messageId: 'smtp-1' });

    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      email: ['customer@example.com'],
      subject: 'Offerte OFF-1',
      fromName: 'MB Boiler',
      fromAddress: 'sales@example.com',
      _rawHtml: '<p>Hello</p>',
    }));
    expect(mockEmailFindByIdAndUpdate).toHaveBeenCalledWith('email-1', {
      $set: expect.objectContaining({
        status: 'SENT',
        externalId: 'smtp-1',
      }),
    });
    expect(mockEventPublish).toHaveBeenCalledWith(
      'doctpl.email.sent',
      expect.objectContaining({ emailRecordId: 'email-1', externalId: 'smtp-1' }),
      { source: 'jobs:email-dispatch' },
    );
  });

  test('throws first SMTP failure so BullMQ performs the single automatic retry', async () => {
    mockEmailFindById.mockResolvedValue(emailRecord());
    mockSendMail.mockRejectedValue(new Error('SMTP unavailable'));
    const worker = new EmailDispatchWorker();

    await expect(worker.process(job({ attemptsMade: 0 }))).rejects.toThrow('SMTP unavailable');

    expect(mockEmailFindByIdAndUpdate).toHaveBeenCalledWith('email-1', {
      $set: {
        status: 'QUEUED',
        errorMessage: 'SMTP unavailable',
      },
      $inc: { retryCount: 1 },
    });
    expect(mockEventPublish).not.toHaveBeenCalledWith(
      'doctpl.email.failed',
      expect.anything(),
      expect.anything(),
    );
  });

  test('marks the record FAILED after the retry attempt also fails', async () => {
    mockEmailFindById.mockResolvedValue(emailRecord());
    mockSendMail.mockRejectedValue(new Error('SMTP unavailable'));
    const worker = new EmailDispatchWorker();

    await expect(worker.process(job({ attemptsMade: 1 }))).rejects.toThrow('SMTP unavailable');

    expect(mockEmailFindByIdAndUpdate).toHaveBeenCalledWith('email-1', {
      $set: {
        status: 'FAILED',
        errorMessage: 'SMTP unavailable',
      },
    });
    expect(mockEventPublish).toHaveBeenCalledWith(
      'doctpl.email.failed',
      { emailRecordId: 'email-1', error: 'SMTP unavailable' },
      { source: 'jobs:email-dispatch' },
    );
  });
});
