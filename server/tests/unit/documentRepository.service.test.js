import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import documentIndexService, { parseRecordId } from '../../src/modules/documents/documentIndex.service.js';
import DocumentIndex from '../../src/modules/documents/documentIndex.model.js';
import { clearTestDb, connectTestDb, disconnectTestDb } from '../setup.js';

const adminUser = {
  _id: new mongoose.Types.ObjectId(),
  role: { name: 'Admin' },
};

describe('DocumentIndexService repository listing', () => {
  beforeAll(connectTestDb);
  beforeEach(clearTestDb);
  afterAll(disconnectTestDb);

  test('normalizes central repository records and filters by association', async () => {
    const projectId = new mongoose.Types.ObjectId();
    const otherProjectId = new mongoose.Types.ObjectId();

    await DocumentIndex.create([
      {
        sourceDocumentId: new mongoose.Types.ObjectId(),
        fileId: new mongoose.Types.ObjectId(),
        title: 'Signed installation contract',
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        documentType: 'CONTRACT',
        category: 'PROJECT',
        projectId,
        fileSizeBytes: 1024,
      },
      {
        sourceDocumentId: new mongoose.Types.ObjectId(),
        fileId: new mongoose.Types.ObjectId(),
        title: 'Other project photo',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        documentType: 'PHOTO',
        category: 'PROJECT',
        projectId: otherProjectId,
      },
    ]);

    const result = await documentIndexService.list({
      source: 'repository',
      origin: 'uploaded',
      projectId: String(projectId),
      limit: 10,
      sortOrder: 'desc',
    }, adminUser);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(expect.objectContaining({
      source: 'repository',
      origin: 'uploaded',
      title: 'Signed installation contract',
      fileName: 'contract.pdf',
      projectId: String(projectId),
      canDelete: true,
    }));
    expect(result.pagination.hasNext).toBe(false);
  });

  test('parses repository record ids and rejects unsupported sources', () => {
    const objectId = new mongoose.Types.ObjectId();

    expect(parseRecordId(`repository:${objectId}`)).toEqual({
      source: 'repository',
      id: String(objectId),
    });
    expect(parseRecordId(`legacy:${objectId}`)).toBeNull();
    expect(parseRecordId('repository:not-an-id')).toBeNull();
  });
});
