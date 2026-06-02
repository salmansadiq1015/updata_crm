import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── All mock registrations must happen before the module under test is imported ──

// Mock BaseWorker — minimal stub so the class can be constructed
jest.unstable_mockModule('../../shared/queue/BaseWorker.js', () => ({
  BaseWorker: class BaseWorker {
    constructor(name) { this.name = name; }
    async process(_job) { throw new Error('process() not implemented'); }
    getHandler() {
      return async (job) => this.process(job);
    }
  },
}));

// Mock config
jest.unstable_mockModule('../../config/index.js', () => ({
  default: { pm: { archiveRetentionDays: 90 } },
}));

// Mock logger (suppress output in tests)
jest.unstable_mockModule('../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock mongoose — only ObjectId constructor is needed
jest.unstable_mockModule('mongoose', () => {
  class FakeObjectId {
    constructor(val) { this._val = val; }
    toString() { return this._val; }
  }
  return { default: { Types: { ObjectId: FakeObjectId } } };
});

// ── Project model ─────────────────────────────────────────────────────────────
const mockProjectFind = jest.fn();
jest.unstable_mockModule('../../modules/pm/project.model.js', () => ({
  default: {
    find: mockProjectFind,
  },
}));

// ── ProjectStatusHistory model ────────────────────────────────────────────────
const mockHistoryAggregate = jest.fn();
jest.unstable_mockModule('../../modules/pm/projectStatusHistory.model.js', () => ({
  default: {
    aggregate: mockHistoryAggregate,
  },
}));

// ── statusService ─────────────────────────────────────────────────────────────
const mockTransitionStatus = jest.fn();
jest.unstable_mockModule('../../modules/pm/status.service.js', () => ({
  default: {
    transitionStatus: mockTransitionStatus,
  },
}));

// ─────────────────────────────────────────────────────────────────────────────

let ProjectArchiveWorker;

beforeAll(async () => {
  const mod = await import('../projectArchive.job.js');
  ProjectArchiveWorker = mod.ProjectArchiveWorker;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a chainable .select().lean() stub */
function selectLeanStub(value) {
  const stub = { select: jest.fn(), lean: jest.fn() };
  stub.select.mockReturnValue(stub);
  stub.lean.mockResolvedValue(value);
  return stub;
}

/** Fake BullMQ job */
const fakeJob = { id: 'test-job', name: 'project-archive', data: {} };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProjectArchiveWorker', () => {
  let worker;

  beforeAll(() => {
    worker = new ProjectArchiveWorker();
  });

  describe('when there are no COMPLETED projects', () => {
    it('returns zeroed counts and does not call transitionStatus', async () => {
      mockProjectFind.mockReturnValue(selectLeanStub([]));

      const result = await worker.process(fakeJob);

      expect(mockTransitionStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ archived: 0, skipped: 0, errors: 0 });
    });
  });

  describe('when a project was completed BEFORE the cutoff (eligible)', () => {
    it('calls transitionStatus with ARCHIVED, a retention comment, and systemUserId', async () => {
      const now = Date.now();
      const retentionDays = 90;
      // Completed 100 days ago — beyond the 90-day retention window
      const completedAt = new Date(now - (retentionDays + 10) * 24 * 60 * 60 * 1000);

      const projectId = 'proj-old-001';
      mockProjectFind.mockReturnValue(
        selectLeanStub([{ _id: { toString: () => projectId } }]),
      );

      mockHistoryAggregate.mockResolvedValue([
        { _id: { toString: () => projectId }, completedAt },
      ]);

      mockTransitionStatus.mockResolvedValue({ toStatus: 'ARCHIVED' });

      const result = await worker.process(fakeJob);

      expect(mockTransitionStatus).toHaveBeenCalledTimes(1);
      expect(mockTransitionStatus).toHaveBeenCalledWith(
        { toString: expect.any(Function) }, // project._id object
        'ARCHIVED',
        {
          comment: 'Auto-archived after retention period',
        },
        expect.objectContaining({ _val: '000000000000000000000000' }), // SYSTEM_USER_ID
      );
      expect(result).toEqual({ archived: 1, skipped: 0, errors: 0 });
    });
  });

  describe('when a project was completed AFTER the cutoff (within retention)', () => {
    it('skips the project and does not call transitionStatus', async () => {
      const now = Date.now();
      const retentionDays = 90;
      // Completed only 10 days ago — well within the retention window
      const completedAt = new Date(now - 10 * 24 * 60 * 60 * 1000);

      const projectId = 'proj-recent-001';
      mockProjectFind.mockReturnValue(
        selectLeanStub([{ _id: { toString: () => projectId } }]),
      );

      mockHistoryAggregate.mockResolvedValue([
        { _id: { toString: () => projectId }, completedAt },
      ]);

      const result = await worker.process(fakeJob);

      expect(mockTransitionStatus).not.toHaveBeenCalled();
      expect(result).toEqual({ archived: 0, skipped: 1, errors: 0 });
    });
  });

  describe('when a mix of eligible and non-eligible projects exist', () => {
    it('archives only projects past the retention cutoff', async () => {
      const now = Date.now();
      const retentionDays = 90;

      const oldProjectId = 'proj-old-002';
      const recentProjectId = 'proj-recent-002';

      const oldCompletedAt = new Date(now - 120 * 24 * 60 * 60 * 1000); // 120 days ago
      const recentCompletedAt = new Date(now - 30 * 24 * 60 * 60 * 1000);  // 30 days ago

      mockProjectFind.mockReturnValue(
        selectLeanStub([
          { _id: { toString: () => oldProjectId } },
          { _id: { toString: () => recentProjectId } },
        ]),
      );

      mockHistoryAggregate.mockResolvedValue([
        { _id: { toString: () => oldProjectId }, completedAt: oldCompletedAt },
        { _id: { toString: () => recentProjectId }, completedAt: recentCompletedAt },
      ]);

      mockTransitionStatus.mockResolvedValue({ toStatus: 'ARCHIVED' });

      const result = await worker.process(fakeJob);

      // Only the old project should be archived
      expect(mockTransitionStatus).toHaveBeenCalledTimes(1);
      expect(mockTransitionStatus).toHaveBeenCalledWith(
        { toString: expect.any(Function) },
        'ARCHIVED',
        { comment: 'Auto-archived after retention period' },
        expect.objectContaining({ _val: '000000000000000000000000' }),
      );
      expect(result).toEqual({ archived: 1, skipped: 1, errors: 0 });
    });
  });

  describe('when transitionStatus throws an error', () => {
    it('increments errors count and continues processing remaining projects', async () => {
      const now = Date.now();
      const retentionDays = 90;

      const failingProjectId = 'proj-fail-001';
      const successProjectId = 'proj-success-001';

      const oldDate = new Date(now - 200 * 24 * 60 * 60 * 1000); // both old

      mockProjectFind.mockReturnValue(
        selectLeanStub([
          { _id: { toString: () => failingProjectId } },
          { _id: { toString: () => successProjectId } },
        ]),
      );

      mockHistoryAggregate.mockResolvedValue([
        { _id: { toString: () => failingProjectId }, completedAt: oldDate },
        { _id: { toString: () => successProjectId }, completedAt: oldDate },
      ]);

      mockTransitionStatus
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ toStatus: 'ARCHIVED' });

      const result = await worker.process(fakeJob);

      expect(mockTransitionStatus).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ archived: 1, skipped: 0, errors: 1 });
    });
  });

  describe('when a project has no status history record', () => {
    it('archives the project (falls back to epoch, always eligible)', async () => {
      const projectId = 'proj-no-history-001';

      mockProjectFind.mockReturnValue(
        selectLeanStub([{ _id: { toString: () => projectId } }]),
      );

      // aggregate returns no record for this project
      mockHistoryAggregate.mockResolvedValue([]);

      mockTransitionStatus.mockResolvedValue({ toStatus: 'ARCHIVED' });

      const result = await worker.process(fakeJob);

      expect(mockTransitionStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ archived: 1, skipped: 0, errors: 0 });
    });
  });
});
