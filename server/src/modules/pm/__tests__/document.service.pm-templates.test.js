import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// PROJ-005 — PM document template types + enriched templateData.
// Verifies documentService.generate(...) for each of the 3 new PM template types
// resolves, creates a ProjectDocument, and builds templateData with the new fields
// (pmEmail / pmPhone / description / milestones array).

// --- Mock document.repository ---
const mockCreate = jest.fn();
const mockFindById = jest.fn();
jest.unstable_mockModule('../document.repository.js', () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    findLatestByFileName: jest.fn(),
  },
}));

// --- Mock project.model (lazily imported by document.service) ---
const mockProjectFindById = jest.fn();
jest.unstable_mockModule('../project.model.js', () => ({
  default: { findById: mockProjectFindById },
}));

// --- Mock scheduleEntry.model (lazily imported for milestones) ---
const mockScheduleFind = jest.fn();
jest.unstable_mockModule('../scheduleEntry.model.js', () => ({
  default: { find: mockScheduleFind },
}));

// --- Mock doctpl documentGeneration.service (lazily imported) ---
const mockDoctplGenerate = jest.fn();
jest.unstable_mockModule('../../doctpl/documentGeneration.service.js', () => ({
  default: { generate: mockDoctplGenerate },
}));

// --- Mock file.service (lazily imported) ---
jest.unstable_mockModule('../../files/file.service.js', () => ({
  default: { upload: jest.fn(), getDownloadUrl: jest.fn() },
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

const NEW_TEMPLATE_TYPES = [
  'project_appointment_confirmation',
  'project_status_report',
  'project_completion_certificate',
];

// Build a populated-project test double: findById(...).populate().populate().populate()
// must resolve to the project document (the service awaits the final populate chain).
function makePopulatedProject(project) {
  const chain = {
    populate: jest.fn(() => chain),
    then: (resolve) => resolve(project),
  };
  return chain;
}

describe('documentService.generate — PM document template types (PROJ-005)', () => {
  const projectId = 'project-77';
  const userId = 'user-77';

  const project = {
    _id: projectId,
    projectNumber: 'P-2026-077',
    name: 'Boiler Replacement',
    projectType: 'INSTALLATION',
    description: 'Replace the aging boiler with a heat pump.',
    plannedStartDate: new Date('2026-07-01T00:00:00.000Z'),
    plannedEndDate: new Date('2026-09-30T00:00:00.000Z'),
    customerId: {
      name: 'Müller AG', street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich',
    },
    projectManagerId: {
      firstName: 'Anna', lastName: 'Schmid', email: 'anna.schmid@example.ch', phone: '+41 44 123 45 67',
    },
    siteId: {
      name: 'Site A', street: 'Industriestrasse 5', postalCode: '8005', city: 'Zürich',
    },
  };

  const milestoneDocs = [
    { name: 'Kickoff', milestoneDate: new Date('2026-07-05T00:00:00.000Z'), status: 'PLANNED' },
    { name: 'Inspection', milestoneDate: new Date('2026-08-15T00:00:00.000Z'), status: 'IN_PROGRESS' },
  ];

  it.each(NEW_TEMPLATE_TYPES)('generates a ProjectDocument with enriched templateData for %s', async (templateType) => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(project));
    mockScheduleFind.mockReturnValue({
      sort: () => ({ lean: async () => milestoneDocs }),
    });
    mockDoctplGenerate.mockResolvedValue({ fileId: 'file-gen', fileName: `${templateType}.pdf` });
    mockCreate.mockResolvedValue({ _id: 'doc-gen' });
    mockFindById.mockResolvedValue({ _id: 'doc-gen', fileId: { _id: 'file-gen' }, isGenerated: true });

    const result = await documentService.generate(projectId, templateType, userId, {});

    // ScheduleEntry queried for project's milestones
    expect(mockScheduleFind).toHaveBeenCalledWith({ projectId, entryType: 'MILESTONE' });

    // doctpl generation called with the requested template type
    expect(mockDoctplGenerate).toHaveBeenCalledTimes(1);
    const genArg = mockDoctplGenerate.mock.calls[0][0];
    expect(genArg.templateType).toBe(templateType);
    expect(genArg.sourceModule).toBe('pm');
    expect(genArg.sourceRecordId).toBe(projectId);

    // Enriched templateData fields
    const { data } = genArg;
    expect(data.pmEmail).toBe('anna.schmid@example.ch');
    expect(data.pmPhone).toBe('+41 44 123 45 67');
    expect(data.description).toBe('Replace the aging boiler with a heat pump.');
    expect(Array.isArray(data.milestones)).toBe(true);
    expect(data.milestones).toEqual([
      { name: 'Kickoff', date: '2026-07-05', status: 'PLANNED' },
      { name: 'Inspection', date: '2026-08-15', status: 'IN_PROGRESS' },
    ]);

    // Existing fields preserved
    expect(data.projectNumber).toBe('P-2026-077');
    expect(data.projectName).toBe('Boiler Replacement');
    expect(data.customer).toMatchObject({ name: 'Müller AG' });
    expect(data.projectManager).toBe('Anna Schmid');

    // A ProjectDocument was created and returned
    const createArg = mockCreate.mock.calls[0][0];
    expect(createArg).toMatchObject({ projectId, fileId: 'file-gen', isGenerated: true });
    expect(result).toMatchObject({ _id: 'doc-gen' });
  });

  it('handles a project with no milestones (empty array, still resolves)', async () => {
    mockProjectFindById.mockReturnValue(makePopulatedProject(project));
    mockScheduleFind.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    mockDoctplGenerate.mockResolvedValue({ fileId: 'file-gen2', fileName: 'x.pdf' });
    mockCreate.mockResolvedValue({ _id: 'doc-gen2' });
    mockFindById.mockResolvedValue({ _id: 'doc-gen2', fileId: { _id: 'file-gen2' } });

    await documentService.generate(projectId, 'project_status_report', userId, {});

    const { data } = mockDoctplGenerate.mock.calls[0][0];
    expect(data.milestones).toEqual([]);
  });
});
