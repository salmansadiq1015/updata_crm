import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// --- Mock document.repository ---
const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockFindLatestByFileName = jest.fn();

jest.unstable_mockModule('../document.repository.js', () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    findLatestByFileName: mockFindLatestByFileName,
  },
}));

// --- Mock project.model (lazily imported by document.service) ---
const mockProjectFindById = jest.fn();
jest.unstable_mockModule('../project.model.js', () => ({
  default: { findById: mockProjectFindById },
}));

// --- Mock file.service (lazily imported) ---
const mockFileUpload = jest.fn();
jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: { upload: mockFileUpload, getDownloadUrl: jest.fn() },
}));

// --- Mock auditService ---
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
    PROJECT_DOCUMENT_UPLOADED: 'PROJECT_DOCUMENT_UPLOADED',
    PROJECT_DOCUMENT_DELETED: 'PROJECT_DOCUMENT_DELETED',
    PROJECT_DOCUMENT_GENERATED: 'PROJECT_DOCUMENT_GENERATED',
  },
}));

// --- Mock config / logger ---
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let documentService;

beforeAll(async () => {
  documentService = (await import('../document.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('documentService.upload — versioning on same-name (A8.2)', () => {
  const projectId = 'project-1';
  const uploadedBy = 'user-1';
  const fileData = {
    buffer: Buffer.from('x'),
    originalName: 'plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1,
    category: 'PLANS',
  };

  it('creates version 1 with no previousVersionId when no prior doc exists', async () => {
    mockProjectFindById.mockResolvedValue({ _id: projectId });
    mockFileUpload.mockResolvedValue({ _id: 'file-1' });
    mockFindLatestByFileName.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ _id: 'doc-1' });
    mockFindById.mockResolvedValue({ _id: 'doc-1', version: 1, fileId: { _id: 'file-1' } });

    await documentService.upload(projectId, fileData, uploadedBy, {});

    expect(mockFindLatestByFileName).toHaveBeenCalledWith(projectId, 'plan.pdf');
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({ version: 1, previousVersionId: null, fileName: 'plan.pdf' });
  });

  it('increments version and links previousVersionId when a same-name doc exists', async () => {
    mockProjectFindById.mockResolvedValue({ _id: projectId });
    mockFileUpload.mockResolvedValue({ _id: 'file-2' });
    mockFindLatestByFileName.mockResolvedValue({ _id: 'doc-prior', version: 3 });
    mockCreate.mockResolvedValue({ _id: 'doc-2' });
    mockFindById.mockResolvedValue({ _id: 'doc-2', version: 4, fileId: { _id: 'file-2' } });

    await documentService.upload(projectId, fileData, uploadedBy, {});

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({ version: 4, previousVersionId: 'doc-prior' });
  });
});

describe('documentService.createFromStoredFile — mobile link (A8.1)', () => {
  const projectId = 'project-9';
  const uploadedBy = 'user-9';

  it('returns null when the project no longer exists', async () => {
    mockProjectFindById.mockReturnValue({ select: () => ({ lean: async () => null }) });

    const result = await documentService.createFromStoredFile(projectId, {
      fileId: 'file-x', fileName: 'photo.jpg', category: 'PHOTOS', uploadedBy,
    });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('creates a ProjectDocument referencing the stored fileId with versioning', async () => {
    mockProjectFindById.mockReturnValue({ select: () => ({ lean: async () => ({ _id: projectId }) }) });
    mockFindLatestByFileName.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ _id: 'doc-m1' });

    const result = await documentService.createFromStoredFile(projectId, {
      fileId: 'file-stored', fileName: 'photo.jpg', category: 'PHOTOS', uploadedBy,
    });

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({
      projectId,
      fileId: 'file-stored',
      fileName: 'photo.jpg',
      category: 'PHOTOS',
      version: 1,
      previousVersionId: null,
      uploadedBy,
    });
    // No re-upload of the file — it is already stored.
    expect(mockFileUpload).not.toHaveBeenCalled();
    expect(result).toEqual({ _id: 'doc-m1' });
  });
});
