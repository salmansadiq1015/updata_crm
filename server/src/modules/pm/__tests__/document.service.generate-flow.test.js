import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// PROJ-005 — document-generation end-user flow.
// Covers: generate() shallow-merges `overrides` into the computed templateData,
// and emailDocument() loads the stored PDF and calls the shared mail helper.

// --- Mock document.repository ---
const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockUpdateById = jest.fn();
jest.unstable_mockModule('../document.repository.js', () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    updateById: mockUpdateById,
    findLatestByFileName: jest.fn(),
  },
}));

// --- Mock project.model (lazily imported) ---
const mockProjectFindById = jest.fn();
jest.unstable_mockModule('../project.model.js', () => ({
  default: { findById: mockProjectFindById },
}));

// --- Mock scheduleEntry.model ---
const mockScheduleFind = jest.fn();
jest.unstable_mockModule('../scheduleEntry.model.js', () => ({
  default: { find: mockScheduleFind },
}));

// --- Mock doctpl documentGeneration.service ---
const mockDoctplGenerate = jest.fn();
jest.unstable_mockModule('../../doctpl/documentGeneration.service.js', () => ({
  default: { generate: mockDoctplGenerate },
}));

// --- Mock file.service ---
const mockFileGetById = jest.fn();
const mockDownloadBuffer = jest.fn();
jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: {
    upload: jest.fn(),
    getDownloadUrl: jest.fn(),
    getById: mockFileGetById,
    downloadBuffer: mockDownloadBuffer,
  },
}));

// --- Mock mail helper ---
const mockSendProjectDocumentEmail = jest.fn();
jest.unstable_mockModule('../../../shared/mail/mail.js', () => ({
  sendProjectDocumentEmail: mockSendProjectDocumentEmail,
}));

// --- Mock auditService ---
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn(), queryByEntity: jest.fn() },
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

function makePopulatedProject(project) {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve) => resolve(project),
  };
  return chain;
}

const baseProject = {
  _id: 'proj-1',
  projectNumber: 'P-2026-001',
  name: 'Boiler Replacement',
  projectType: 'INSTALLATION',
  description: 'Original description.',
  plannedStartDate: new Date('2026-07-01T00:00:00.000Z'),
  plannedEndDate: new Date('2026-09-30T00:00:00.000Z'),
  customerId: { name: 'Müller AG', street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich' },
  projectManagerId: { firstName: 'Anna', lastName: 'Schmid', email: 'anna@example.ch', phone: '+41 44 123 45 67' },
  siteId: { name: 'Site A', street: 'Industriestrasse 5', postalCode: '8005', city: 'Zürich' },
};

describe('documentService.generate — overrides merge (PROJ-005 AC-4)', () => {
  it('shallow-merges overrides over computed templateData', async () => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(baseProject));
    mockScheduleFind.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    mockDoctplGenerate.mockResolvedValue({ fileId: 'file-1', fileName: 'doc.pdf' });
    mockCreate.mockResolvedValue({ _id: 'doc-1' });
    mockFindById.mockResolvedValue({ _id: 'doc-1', fileId: { _id: 'file-1' }, isGenerated: true });

    const overrides = { description: 'Custom intro text', recipientName: 'Herr Meier', notes: 'Bitte beachten.' };
    await documentService.generate('proj-1', 'project_status_report', 'user-1', {}, overrides);

    const { data } = mockDoctplGenerate.mock.calls[0][0];
    // Override wins over computed value
    expect(data.description).toBe('Custom intro text');
    // Extra override keys are merged in
    expect(data.recipientName).toBe('Herr Meier');
    expect(data.notes).toBe('Bitte beachten.');
    // Non-overridden computed fields preserved
    expect(data.projectNumber).toBe('P-2026-001');
    expect(data.projectManager).toBe('Anna Schmid');

    // overrides persisted on the document row
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({ status: 'FINAL', templateType: 'project_status_report', overrides });
  });

  it('previewDocument composes the body without generating a PDF (PROJ-005 AC-4)', async () => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(baseProject));
    mockScheduleFind.mockReturnValue({ sort: () => ({ lean: async () => [] }) });

    const result = await documentService.previewDocument('proj-1', 'project_status_report', {
      description: 'Custom preview body',
      notes: 'Closing remark.',
    });

    // Composed letter body reflects the override…
    expect(result.introduction).toContain('Custom preview body');
    expect(result.introduction).toContain('Closing remark.');
    // …and the computed project data is present.
    expect(result.projectNumber).toBe('P-2026-001');
    expect(result.templateType).toBe('project_status_report');
    // No PDF generated, nothing persisted.
    expect(mockDoctplGenerate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('defaults overrides to {} when not provided (backward compatible)', async () => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(baseProject));
    mockScheduleFind.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    mockDoctplGenerate.mockResolvedValue({ fileId: 'file-2', fileName: 'doc2.pdf' });
    mockCreate.mockResolvedValue({ _id: 'doc-2' });
    mockFindById.mockResolvedValue({ _id: 'doc-2', fileId: { _id: 'file-2' } });

    await documentService.generate('proj-1', 'project_status_report', 'user-1');

    const { data } = mockDoctplGenerate.mock.calls[0][0];
    expect(data.description).toBe('Original description.');
    expect(mockCreate.mock.calls[0][0].overrides).toEqual({});
  });

  it('finalizes an existing draft in place when draftId is supplied', async () => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(baseProject));
    mockScheduleFind.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    mockDoctplGenerate.mockResolvedValue({ fileId: 'file-3', fileName: 'doc3.pdf' });
    mockUpdateById.mockResolvedValue({ _id: 'draft-1' });
    mockFindById.mockResolvedValue({ _id: 'draft-1', fileId: { _id: 'file-3' } });

    await documentService.generate('proj-1', 'project_status_report', 'user-1', {}, {}, 'draft-1');

    expect(mockCreate).not.toHaveBeenCalled();
    const [id, update] = mockUpdateById.mock.calls[0];
    expect(id).toBe('draft-1');
    expect(update).toMatchObject({ status: 'FINAL', isGenerated: true, fileId: 'file-3' });
  });
});

describe('documentService.saveDraft — persisted draft (PROJ-005 AF-2)', () => {
  it('creates a DRAFT row with templateType + overrides and no file', async () => {
    mockProjectFindById.mockReturnValue({ select: () => ({ lean: async () => ({ _id: 'proj-1', projectNumber: 'P-2026-001' }) }) });
    mockCreate.mockResolvedValue({ _id: 'draft-9' });
    mockFindById.mockResolvedValue({ _id: 'draft-9', status: 'DRAFT' });

    const overrides = { notes: 'WIP' };
    await documentService.saveDraft('proj-1', { templateType: 'project_status_report', overrides }, 'user-1', {});

    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({
      projectId: 'proj-1',
      fileId: null,
      status: 'DRAFT',
      templateType: 'project_status_report',
      overrides,
    });
  });
});

describe('documentService.emailDocument — send PDF attachment (PROJ-005 AC-5)', () => {
  it('loads the stored file and calls the mail helper with an attachment', async () => {
    const buffer = Buffer.from('%PDF-1.4 fake');
    mockFindById.mockResolvedValue({
      _id: 'doc-1', projectId: 'proj-1', fileId: 'file-1',
      fileName: 'Statusbericht.pdf', originalName: 'Statusbericht.pdf',
    });
    mockFileGetById.mockResolvedValue({ _id: 'file-1', key: 'documents/pm/file-1.pdf', mimeType: 'application/pdf' });
    mockDownloadBuffer.mockResolvedValue(buffer);
    mockProjectFindById.mockReturnValue({ select: () => ({ lean: async () => ({ name: 'Boiler', projectNumber: 'P-2026-001' }) }) });
    mockSendProjectDocumentEmail.mockResolvedValue({ messageId: 'mid-1' });

    const result = await documentService.emailDocument('doc-1', { to: 'kunde@example.ch', message: 'Hallo' }, 'user-1', {});

    expect(mockDownloadBuffer).toHaveBeenCalledWith('documents/pm/file-1.pdf');
    expect(mockSendProjectDocumentEmail).toHaveBeenCalledTimes(1);
    const [to, data, attachment] = mockSendProjectDocumentEmail.mock.calls[0];
    expect(to).toBe('kunde@example.ch');
    expect(data).toMatchObject({ projectName: 'Boiler', projectNumber: 'P-2026-001', fileName: 'Statusbericht.pdf', message: 'Hallo' });
    expect(attachment).toMatchObject({ filename: 'Statusbericht.pdf', content: buffer, contentType: 'application/pdf' });
    expect(result).toMatchObject({ sent: true, to: 'kunde@example.ch', messageId: 'mid-1' });
  });

  it('refuses to email a draft (no file attached)', async () => {
    mockFindById.mockResolvedValue({ _id: 'draft-1', projectId: 'proj-1', fileId: null, fileName: 'Entwurf.pdf' });

    await expect(
      documentService.emailDocument('draft-1', { to: 'x@example.ch' }, 'user-1', {}),
    ).rejects.toThrow();
    expect(mockSendProjectDocumentEmail).not.toHaveBeenCalled();
  });
});
