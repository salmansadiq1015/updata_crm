import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── Mock repositories & services before importing controller ──────────────────

const mockFindByArticleId = jest.fn();
const mockCreate = jest.fn();
const mockDeleteById = jest.fn();

jest.unstable_mockModule('../articleImage.repository.js', () => ({
  default: {
    findByArticleId: mockFindByArticleId,
    create: mockCreate,
    deleteById: mockDeleteById,
  },
}));

const mockFileServiceUpload = jest.fn();

jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: {
    upload: mockFileServiceUpload,
    delete: jest.fn(),
  },
}));

// ── Lazy-load controller after mocks are installed ────────────────────────────

let articleImageController;

beforeAll(async () => {
  const mod = await import('../articleImage.controller.js');
  articleImageController = mod.default;
});

afterEach(() => jest.clearAllMocks());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    params: { articleId: '507f1f77bcf86cd799439011' },
    user: { _id: '507f1f77bcf86cd799439012' },
    file: null,
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.success = jest.fn().mockReturnValue(res);
  return res;
}

// ── list ──────────────────────────────────────────────────────────────────────

describe('articleImageController.list()', () => {
  it('returns empty array when no images exist for the article', async () => {
    mockFindByArticleId.mockResolvedValue([]);

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.list(req, res, next);

    expect(mockFindByArticleId).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(res.success).toHaveBeenCalledWith({ data: [] });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns images when they exist', async () => {
    const images = [
      { _id: 'img1', articleId: '507f1f77bcf86cd799439011', fileId: 'file1', sortOrder: 0 },
    ];
    mockFindByArticleId.mockResolvedValue(images);

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.list(req, res, next);

    expect(res.success).toHaveBeenCalledWith({ data: images });
  });

  it('calls next(err) on repository error', async () => {
    const err = new Error('DB failure');
    mockFindByArticleId.mockRejectedValue(err);

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.list(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── upload ────────────────────────────────────────────────────────────────────

describe('articleImageController.upload()', () => {
  it('calls next(ValidationError) when no file is provided', async () => {
    const req = makeReq({ file: null });
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.upload(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400, message: 'No file provided' });
    expect(mockFileServiceUpload).not.toHaveBeenCalled();
  });

  it('creates image record and returns 201 on success', async () => {
    const fileMetadata = {
      _id: 'fileMeta1',
      key: 'catalog/article/507f1f77bcf86cd799439011/ts_photo.jpg',
    };
    mockFileServiceUpload.mockResolvedValue(fileMetadata);

    const savedImage = {
      _id: 'img1',
      articleId: '507f1f77bcf86cd799439011',
      fileId: 'fileMeta1',
      sortOrder: 0,
    };
    mockCreate.mockResolvedValue(savedImage);

    const req = makeReq({
      file: {
        buffer: Buffer.from('fake'),
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: 12345,
      },
    });
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.upload(req, res, next);

    expect(mockFileServiceUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12345,
        module: 'catalog',
        entityType: 'article',
        entityId: '507f1f77bcf86cd799439011',
        uploadedBy: '507f1f77bcf86cd799439012',
        bucket: 'images',
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith({
      articleId: '507f1f77bcf86cd799439011',
      fileId: 'fileMeta1',
      sortOrder: 0,
    });
    expect(res.success).toHaveBeenCalledWith({ data: savedImage, statusCode: 201 });
  });

  it('calls next(err) on service error', async () => {
    const err = new Error('S3 unavailable');
    mockFileServiceUpload.mockRejectedValue(err);

    const req = makeReq({
      file: {
        buffer: Buffer.from('x'),
        originalname: 'x.jpg',
        mimetype: 'image/jpeg',
        size: 1,
      },
    });
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.upload(req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe('articleImageController.remove()', () => {
  it('deletes image and returns success', async () => {
    const image = {
      _id: 'img1',
      articleId: { toString: () => '507f1f77bcf86cd799439011' },
      fileId: 'fileMeta1',
    };
    mockFindByArticleId.mockResolvedValue([image]);

    // We need findById — but repository doesn't have it;
    // controller uses findByArticleId + filter. Tested via remove() directly.
    const req = makeReq({
      params: {
        articleId: '507f1f77bcf86cd799439011',
        imageId: 'img1',
      },
    });
    const res = makeRes();
    const next = jest.fn();

    // The controller calls deleteById — simulate it succeeding
    mockDeleteById.mockResolvedValue(true);

    // We'll test that remove calls next when image lookup returns nothing
    // (since repository has no findById, the controller handles this)
    await articleImageController.remove(req, res, next);

    expect(mockDeleteById).toHaveBeenCalledWith('img1');
    expect(res.success).toHaveBeenCalledWith({ data: { deleted: true } });
  });

  it('calls next(err) when image is not found', async () => {
    mockFindByArticleId.mockResolvedValue([]);

    const req = makeReq({
      params: {
        articleId: '507f1f77bcf86cd799439011',
        imageId: 'nonexistent',
      },
    });
    const res = makeRes();
    const next = jest.fn();

    await articleImageController.remove(req, res, next);

    // Should either throw NotFoundError or call next with an error
    expect(next).toHaveBeenCalled();
  });
});
