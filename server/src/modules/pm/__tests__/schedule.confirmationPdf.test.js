import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// --- Mock scheduleRepository ---
const mockFindById = jest.fn();
const mockCreateConfirmation = jest.fn();
jest.unstable_mockModule('../schedule.repository.js', () => ({
  default: {
    findById: mockFindById,
    createConfirmation: mockCreateConfirmation,
    findByProjectId: jest.fn(),
    findConfirmationsByEntryIds: jest.fn(),
  },
}));

// --- Mock cacheManager ---
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: jest.fn(async (_k, p) => p()), del: jest.fn(), invalidatePattern: jest.fn() },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({ default: { publish: jest.fn() } }));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { PARTNER_CONFIRMATION_SENT: 'PARTNER_CONFIRMATION_SENT' },
}));

// --- Mock queueManager ---
const mockAddJob = jest.fn();
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: mockAddJob },
}));

// --- Mock project.model (dynamically imported) ---
jest.unstable_mockModule('../project.model.js', () => ({
  default: {
    findById: jest.fn(() => ({
      select: () => ({ lean: async () => ({ name: 'Heizung Muster', projectNumber: 'PRJ-2026-00042' }) }),
    })),
  },
}));

// --- Mock documentGeneration.service (dynamically imported) ---
const mockGenerate = jest.fn();
jest.unstable_mockModule('../../doctpl/documentGeneration.service.js', () => ({
  default: { generate: mockGenerate },
}));

// --- Mock config / logger ---
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' }, pm: { scheduleConfirmationLeadDays: 5 } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let scheduleService;

beforeAll(async () => {
  scheduleService = (await import('../schedule.service.js')).default;
});

afterEach(() => jest.clearAllMocks());

describe('scheduleService.sendConfirmation — PDF generation (PROJ-004 AC-3)', () => {
  const entry = {
    _id: 'entry-1',
    projectId: 'proj-1',
    name: 'Heating Installation',
    entryType: 'PHASE',
    startDate: new Date('2026-12-01'),
    endDate: new Date('2026-12-05'),
    notes: 'Bring the heat pump',
  };
  const data = {
    partnerCompanyId: 'partner-1',
    partnerContactEmail: 'partner@example.com',
    partnerName: 'ACME Plumbing',
    siteAddress: 'Bahnhofstrasse 1, 8000 Zürich',
    contactPerson: 'Hans Muster',
    acknowledgeShortNotice: true,
  };

  it('generates an appointment-confirmation PDF and links its documentId', async () => {
    mockFindById.mockResolvedValue(entry);
    mockGenerate.mockResolvedValue({ _id: 'gendoc-1', fileId: 'file-1', fileName: 'conf.pdf' });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf-1' });

    await scheduleService.sendConfirmation('entry-1', data, 'user-1', {});

    // PDF generated from the seeded appointment-confirmation template
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      templateType: 'project_appointment_confirmation',
      sourceModule: 'pm',
      sourceRecordId: 'proj-1',
    });

    // Confirmation row links the generated document
    expect(mockCreateConfirmation).toHaveBeenCalledTimes(1);
    expect(mockCreateConfirmation.mock.calls[0][0]).toMatchObject({ documentId: 'gendoc-1' });
  });

  it('passes the generated fileId to the email job so the PDF is attached', async () => {
    mockFindById.mockResolvedValue(entry);
    mockGenerate.mockResolvedValue({ _id: 'gendoc-1', fileId: 'file-1', fileName: 'conf.pdf' });
    mockCreateConfirmation.mockResolvedValue({ _id: 'conf-1' });

    await scheduleService.sendConfirmation('entry-1', data, 'user-1', {});

    expect(mockAddJob).toHaveBeenCalledTimes(1);
    const [, jobType, jobData] = mockAddJob.mock.calls[0];
    expect(jobType).toBe('send-partner-confirmation');
    expect(jobData).toMatchObject({ documentFileId: 'file-1' });
  });
});
