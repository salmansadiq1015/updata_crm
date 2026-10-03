import {
  jest, describe, it, beforeAll, beforeEach, expect,
} from '@jest/globals';

// ── Mock registrations (before importing the worker under test) ───────────────

const mockFindById = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
jest.unstable_mockModule('../../modules/businessDiscovery/leadImportJob.model.js', () => ({
  default: { findById: mockFindById, findByIdAndUpdate: mockFindByIdAndUpdate },
  LEAD_IMPORT_JOB_STATUS: {
    QUEUED: 'QUEUED', RUNNING: 'RUNNING', COMPLETED: 'COMPLETED', PARTIAL: 'PARTIAL', FAILED: 'FAILED', CANCELLED: 'CANCELLED',
  },
}));

const mockComputeEligibility = jest.fn();
const mockProcessBatch = jest.fn();
jest.unstable_mockModule('../../modules/businessDiscovery/import.service.js', () => ({
  default: { computeEligibility: mockComputeEligibility, processBatch: mockProcessBatch },
  IMPORT_CHUNK_SIZE: 50,
}));

const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../modules/auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

const mockNotifyCreate = jest.fn();
jest.unstable_mockModule('../../modules/notifications/notification.service.js', () => ({
  default: { create: mockNotifyCreate },
}));

jest.unstable_mockModule('../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let LeadImportWorker;

beforeAll(async () => {
  LeadImportWorker = (await import('../leadImport.job.js')).LeadImportWorker;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByIdAndUpdate.mockResolvedValue({});
  mockNotifyCreate.mockResolvedValue({});
});

function makeJob(eligibleCount) {
  return {
    data: { importJobId: 'job-1', createdBy: 'user-1' },
    updateProgress: jest.fn().mockResolvedValue(undefined),
    _eligibleCount: eligibleCount,
  };
}

function leanDoc(doc) {
  return { lean: () => Promise.resolve(doc) };
}

describe('LeadImportWorker.isAlreadyDone', () => {
  it('is true for a terminal job (COMPLETED)', async () => {
    mockFindById.mockReturnValue(leanDoc({ status: 'COMPLETED' }));
    const worker = new LeadImportWorker();
    expect(await worker.isAlreadyDone({ data: { importJobId: 'job-1' } })).toBe(true);
  });

  it('is false for a running job (retry/redelivery may continue)', async () => {
    mockFindById.mockReturnValue(leanDoc({ status: 'RUNNING' }));
    const worker = new LeadImportWorker();
    expect(await worker.isAlreadyDone({ data: { importJobId: 'job-1' } })).toBe(false);
  });

  it('is false when the job is missing', async () => {
    mockFindById.mockReturnValue(leanDoc(null));
    const worker = new LeadImportWorker();
    expect(await worker.isAlreadyDone({ data: { importJobId: 'job-1' } })).toBe(false);
  });
});

describe('LeadImportWorker.process — batched progress', () => {
  it('imports eligible results in chunks of 50, updating progress + counts, and completes', async () => {
    const eligible = Array.from({ length: 120 }, (_, i) => ({ _id: `r${i}` }));
    mockFindById.mockReturnValue(leanDoc({
      createdBy: 'user-1', mode: 'new', selection: { kind: 'ALL_NEW' }, discoverySessionId: 'sess-1',
    }));
    mockComputeEligibility.mockResolvedValue({ eligible });
    mockProcessBatch.mockImplementation(async (chunk) => ({
      imported: chunk.length, existing: 0, skipped: 0, failed: 0, duplicates: 0, total: chunk.length,
    }));

    const worker = new LeadImportWorker();
    const job = makeJob(120);
    const result = await worker.process(job);

    expect(mockComputeEligibility).toHaveBeenCalledWith('sess-1', { mode: 'new', selection: { kind: 'ALL_NEW' } }, 'user-1');
    expect(mockProcessBatch).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(job.updateProgress).toHaveBeenCalledTimes(3);
    expect(job.updateProgress).toHaveBeenLastCalledWith(100);

    expect(result).toMatchObject({ status: 'COMPLETED', total: 120, imported: 120 });
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'RUNNING' }));
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'COMPLETED' }));
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.bulk_import_completed' }));
    expect(mockNotifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ channels: ['IN_APP'], category: 'CRM', recipientIds: ['user-1'] }),
      'user-1',
    );
  });

  it('finishes PARTIAL when any row fails', async () => {
    const eligible = Array.from({ length: 60 }, (_, i) => ({ _id: `r${i}` }));
    mockFindById.mockReturnValue(leanDoc({
      createdBy: 'user-1', mode: 'new', selection: { kind: 'ALL_NEW' }, discoverySessionId: 'sess-1',
    }));
    mockComputeEligibility.mockResolvedValue({ eligible });
    mockProcessBatch
      .mockResolvedValueOnce({
        imported: 49, existing: 0, skipped: 0, failed: 1, duplicates: 0, total: 50,
      })
      .mockResolvedValueOnce({
        imported: 10, existing: 0, skipped: 0, failed: 0, duplicates: 0, total: 10,
      });

    const worker = new LeadImportWorker();
    const result = await worker.process(makeJob(60));

    expect(result).toMatchObject({ status: 'PARTIAL', failed: 1, imported: 59 });
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'PARTIAL' }));
  });

  it('marks the job FAILED and rethrows on a fatal error', async () => {
    mockFindById.mockReturnValue(leanDoc({
      createdBy: 'user-1', mode: 'new', selection: { kind: 'ALL_NEW' }, discoverySessionId: 'sess-1',
    }));
    mockComputeEligibility.mockRejectedValue(new Error('db exploded'));

    const worker = new LeadImportWorker();
    await expect(worker.process(makeJob(0))).rejects.toThrow('db exploded');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'FAILED' }));
  });
});
