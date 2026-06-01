import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// --- Mock mobilePhoto.repository ---
const mockPhotoCreate = jest.fn();
jest.unstable_mockModule('../mobilePhoto.repository.js', () => ({
  default: { create: mockPhotoCreate, findByOrderId: jest.fn(), findById: jest.fn(), deleteById: jest.fn() },
}));

// --- Mock auditService ---
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

// --- Mock eventBus / EVENT_TYPES ---
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { MOBILE_PHOTO_UPLOADED: 'MOBILE_PHOTO_UPLOADED' },
}));

// --- Mock cacheManager ---
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: jest.fn(async (_k, p) => p()), del: jest.fn(), invalidatePattern: jest.fn() },
}));

// --- Mock logger ---
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// --- Mock file.service (lazily imported) ---
const mockFileUpload = jest.fn();
jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: { upload: mockFileUpload, getDownloadUrl: jest.fn(), delete: jest.fn() },
}));

// --- Mock qop/order.model (lazily imported by _linkToProjectRepository) ---
const mockOrderFindById = jest.fn();
jest.unstable_mockModule('../../qop/order.model.js', () => ({
  default: { findById: mockOrderFindById },
}));

// --- Mock pm/document.service (lazily imported) ---
const mockCreateFromStoredFile = jest.fn();
jest.unstable_mockModule('../../pm/document.service.js', () => ({
  default: { createFromStoredFile: mockCreateFromStoredFile },
}));

let photoService;

beforeAll(async () => {
  photoService = (await import('../photo.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('photoService.upload — link mobile photo into project repository (A8.1)', () => {
  const orderId = 'order-1';
  const userId = 'user-1';
  const fileData = {
    buffer: Buffer.from('img'),
    originalName: 'before.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 3,
  };
  const metadata = { category: 'BEFORE', capturedAt: new Date() };

  it('creates a ProjectDocument when the order belongs to a project', async () => {
    mockFileUpload.mockResolvedValue({ _id: 'file-1' });
    mockPhotoCreate.mockResolvedValue({ _id: 'photo-1', orderId });
    mockOrderFindById.mockReturnValue({ select: () => ({ lean: async () => ({ projectId: 'project-7' }) }) });

    await photoService.upload(orderId, fileData, metadata, userId, {});

    // FileMetadata/MobilePhoto write still happens (additive, not replaced).
    expect(mockPhotoCreate).toHaveBeenCalledTimes(1);
    // ProjectDocument linked with the SAME stored fileId, category PHOTOS.
    expect(mockCreateFromStoredFile).toHaveBeenCalledTimes(1);
    const [pid, payload] = mockCreateFromStoredFile.mock.calls[0];
    expect(pid).toBe('project-7');
    expect(payload).toMatchObject({
      fileId: 'file-1',
      fileName: 'before.jpg',
      category: 'PHOTOS',
      uploadedBy: userId,
    });
  });

  it('does NOT create a ProjectDocument when the order has no project', async () => {
    mockFileUpload.mockResolvedValue({ _id: 'file-2' });
    mockPhotoCreate.mockResolvedValue({ _id: 'photo-2', orderId });
    mockOrderFindById.mockReturnValue({ select: () => ({ lean: async () => ({ projectId: null }) }) });

    await photoService.upload(orderId, fileData, metadata, userId, {});

    expect(mockPhotoCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateFromStoredFile).not.toHaveBeenCalled();
  });

  it('still succeeds (and keeps the photo) if linking throws', async () => {
    mockFileUpload.mockResolvedValue({ _id: 'file-3' });
    mockPhotoCreate.mockResolvedValue({ _id: 'photo-3', orderId });
    mockOrderFindById.mockImplementation(() => { throw new Error('db down'); });

    const result = await photoService.upload(orderId, fileData, metadata, userId, {});

    expect(result).toEqual({ _id: 'photo-3', orderId });
    expect(mockPhotoCreate).toHaveBeenCalledTimes(1);
  });
});
