import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// --- Mock prepAction.repository ---
const mockFindById = jest.fn();
const mockAddAttachment = jest.fn();

jest.unstable_mockModule('../prepAction.repository.js', () => ({
  default: {
    findById: mockFindById,
    addAttachment: mockAddAttachment,
  },
}));

// --- Mock auditService (pm/ imports ../auth/audit.service.js) ---
const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent, queryByEntity: jest.fn() },
}));

// --- Mock cacheManager ---
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: jest.fn(async (_k, producer) => producer()),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

// --- Mock eventBus / EVENT_TYPES ---
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    PREP_ACTION_CREATED: 'PREP_ACTION_CREATED',
    PREP_ACTION_UPDATED: 'PREP_ACTION_UPDATED',
    PREP_ACTION_DELETED: 'PREP_ACTION_DELETED',
  },
}));

// --- Mock config / logger ---
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// --- Mock file.service (lazily imported by prepAction.service: ../files/file.service.js) ---
const mockFileUpload = jest.fn();
const mockGetDownloadUrl = jest.fn();
jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: { upload: mockFileUpload, getDownloadUrl: mockGetDownloadUrl },
}));

let prepActionService;

beforeAll(async () => {
  prepActionService = (await import('../prepAction.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('prepActionService.addAttachment', () => {
  const actionId = 'action-123';
  const projectId = 'project-456';
  const uploadedBy = 'user-789';
  const fileData = {
    buffer: Buffer.from('hello'),
    originalName: 'plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 5,
  };

  it('uploads the file via file.service and pushes a fileId reference onto the action', async () => {
    mockFindById.mockResolvedValue({ _id: actionId, projectId });
    mockFileUpload.mockResolvedValue({ _id: 'file-001' });
    mockAddAttachment.mockResolvedValue({
      _id: actionId,
      attachments: [{ _id: 'att-1', fileId: 'file-001', fileName: 'plan.pdf', uploadedBy }],
    });

    const result = await prepActionService.addAttachment(actionId, fileData, uploadedBy, {});

    // file.service.upload called with the document-style payload
    expect(mockFileUpload).toHaveBeenCalledTimes(1);
    const uploadArg = mockFileUpload.mock.calls[0][0];
    expect(uploadArg).toMatchObject({
      originalName: 'plan.pdf',
      mimeType: 'application/pdf',
      module: 'pm',
      entityType: 'prep-action',
      entityId: actionId,
      uploadedBy,
      bucket: 'documents',
    });

    // repository.addAttachment receives the fileId reference shape
    expect(mockAddAttachment).toHaveBeenCalledTimes(1);
    const [calledActionId, attachment] = mockAddAttachment.mock.calls[0];
    expect(calledActionId).toBe(actionId);
    expect(attachment).toMatchObject({
      fileId: 'file-001',
      fileName: 'plan.pdf',
      uploadedBy,
    });

    // audit logged + attachments array returned
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'prep_action.attachment_added', module: 'pm' }),
    );
    expect(result).toEqual([
      expect.objectContaining({ fileId: 'file-001', fileName: 'plan.pdf' }),
    ]);
  });

  it('throws NotFoundError when the action does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(
      prepActionService.addAttachment('missing', fileData, uploadedBy, {}),
    ).rejects.toThrow();
    expect(mockFileUpload).not.toHaveBeenCalled();
  });
});

describe('prepActionService.listAttachments', () => {
  it('returns the attachments array of the action', async () => {
    const attachments = [{ _id: 'att-1', fileId: 'file-001', fileName: 'a.pdf' }];
    mockFindById.mockResolvedValue({ _id: 'a1', projectId: 'p1', attachments });

    const result = await prepActionService.listAttachments('a1');
    expect(result).toBe(attachments);
  });

  it('returns an empty array when the action has no attachments', async () => {
    mockFindById.mockResolvedValue({ _id: 'a1', projectId: 'p1' });
    const result = await prepActionService.listAttachments('a1');
    expect(result).toEqual([]);
  });

  it('throws NotFoundError for a missing action', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(prepActionService.listAttachments('missing')).rejects.toThrow();
  });
});
