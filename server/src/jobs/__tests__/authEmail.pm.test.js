import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// ── Mail helpers ──────────────────────────────────────────────────────────────
const mockSendProjectStatusNotification = jest.fn();
const mockSendPartnerConfirmationEmail = jest.fn();
const mockSendAppointmentConfirmationEmail = jest.fn();
const mockSendAppointmentReminderEmail = jest.fn();
const mockSendAppointmentCancellationEmail = jest.fn();
const mockSendAppointmentRescheduledEmail = jest.fn();
const mockSendQuotationEmail = jest.fn();
const mockSendQopAppointmentReminderEmail = jest.fn();

jest.unstable_mockModule('../../shared/mail/mail.js', () => ({
  sendInvoiceSentEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendActivationEmail: jest.fn(),
  sendPasswordChangedEmail: jest.fn(),
  sendProjectStatusNotification: mockSendProjectStatusNotification,
  sendPartnerConfirmationEmail: mockSendPartnerConfirmationEmail,
  sendAppointmentConfirmationEmail: mockSendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail: mockSendAppointmentReminderEmail,
  sendAppointmentCancellationEmail: mockSendAppointmentCancellationEmail,
  sendAppointmentRescheduledEmail: mockSendAppointmentRescheduledEmail,
  sendQuotationEmail: mockSendQuotationEmail,
  sendQopAppointmentReminderEmail: mockSendQopAppointmentReminderEmail,
}));

// ── Logger (suppress output in tests) ────────────────────────────────────────
jest.unstable_mockModule('../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── BaseWorker (minimal stub so the class can be constructed) ─────────────────
jest.unstable_mockModule('../../shared/queue/BaseWorker.js', () => ({
  BaseWorker: class BaseWorker {
    constructor(name) { this.name = name; }
    async process(_job) { throw new Error('process() not implemented'); }
  },
}));

// ── Project model ─────────────────────────────────────────────────────────────
const mockProjectFindById = jest.fn();

jest.unstable_mockModule('../../modules/pm/project.model.js', () => ({
  default: {
    findById: mockProjectFindById,
  },
}));

// ── User model ────────────────────────────────────────────────────────────────
const mockUserFindById = jest.fn();

jest.unstable_mockModule('../../modules/auth/user.model.js', () => ({
  default: {
    findById: mockUserFindById,
  },
}));

// ── File service (lazily imported to load the PDF buffer) ─────────────────────
const mockFileGetById = jest.fn();
const mockFileDownloadBuffer = jest.fn();

jest.unstable_mockModule('../../modules/files/file.service.js', () => ({
  default: {
    getById: mockFileGetById,
    downloadBuffer: mockFileDownloadBuffer,
  },
}));

// ── Module under test (imported AFTER all unstable_mockModule calls) ──────────
let AuthEmailWorker;

beforeAll(async () => {
  const mod = await import('../authEmail.job.js');
  AuthEmailWorker = mod.AuthEmailWorker;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a fake BullMQ job object */
function makeJob(name, data) {
  return { id: 'test-job-1', name, data };
}

/** Chainable query stub: .select().lean() returns value */
function queryStub(value) {
  const stub = { select: jest.fn(), lean: jest.fn() };
  stub.select.mockReturnValue(stub);
  stub.lean.mockResolvedValue(value);
  return stub;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthEmailWorker — PM job types', () => {
  let worker;

  beforeAll(() => {
    worker = new AuthEmailWorker();
  });

  afterEach(() => jest.clearAllMocks());

  // ── send-partner-confirmation ─────────────────────────────────────────────

  describe('send-partner-confirmation', () => {
    it('calls sendPartnerConfirmationEmail with the job data email', async () => {
      mockSendPartnerConfirmationEmail.mockResolvedValue({});

      const data = {
        email: 'partner@example.com',
        partnerName: 'ACME GmbH',
        projectName: 'Heizung Umbau',
        projectNumber: 'P-2024-001',
        entryName: 'Montage Woche 1',
        startDate: '2024-03-01',
        endDate: '2024-03-07',
        siteAddress: 'Musterstrasse 1, 3000 Bern',
        contactPerson: 'Hans Müller',
        notes: 'Bitte Werkzeug mitbringen',
      };

      const result = await worker.process(makeJob('send-partner-confirmation', data));

      expect(mockSendPartnerConfirmationEmail).toHaveBeenCalledTimes(1);
      expect(mockSendPartnerConfirmationEmail).toHaveBeenCalledWith(
        'partner@example.com',
        expect.objectContaining({
          partnerName: 'ACME GmbH',
          projectName: 'Heizung Umbau',
          projectNumber: 'P-2024-001',
          entryName: 'Montage Woche 1',
          confirmationUrl: '',
        }),
        null,
      );
      expect(result).toEqual({ sent: true, jobType: 'send-partner-confirmation', email: 'partner@example.com' });
    });

    it('returns skipped when email is missing', async () => {
      const result = await worker.process(makeJob('send-partner-confirmation', { partnerName: 'X' }));

      expect(mockSendPartnerConfirmationEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: 'no_recipient_email' });
    });

    it('loads the generated PDF and attaches it when documentFileId is present', async () => {
      mockSendPartnerConfirmationEmail.mockResolvedValue({});
      mockFileGetById.mockResolvedValue({ key: 'pm/conf-1.pdf', mimeType: 'application/pdf' });
      const pdfBuffer = Buffer.from('%PDF-1.4 fake');
      mockFileDownloadBuffer.mockResolvedValue(pdfBuffer);

      await worker.process(makeJob('send-partner-confirmation', {
        email: 'partner@example.com',
        partnerName: 'ACME GmbH',
        projectNumber: 'P-2024-001',
        entryName: 'Montage',
        documentFileId: 'file-1',
      }));

      expect(mockFileGetById).toHaveBeenCalledWith('file-1');
      expect(mockFileDownloadBuffer).toHaveBeenCalledWith('pm/conf-1.pdf');
      // third positional arg is the PDF attachment buffer
      expect(mockSendPartnerConfirmationEmail.mock.calls[0][2]).toBe(pdfBuffer);
    });
  });

  // ── send-status-notification ──────────────────────────────────────────────

  describe('send-status-notification', () => {
    const PM_ID = 'pm-user-id-111';
    const ACTOR_ID = 'actor-user-id-222';

    it('resolves PM and calls sendProjectStatusNotification when PM differs from actor', async () => {
      mockSendProjectStatusNotification.mockResolvedValue({});

      // Project.findById() stub
      mockProjectFindById.mockReturnValue(
        queryStub({
          _id: 'proj-1',
          name: 'Neuinstallation Bern',
          projectNumber: 'P-2024-042',
          projectManagerId: PM_ID,
        }),
      );

      // User.findById() — called twice: once for PM, once for actor
      mockUserFindById
        .mockReturnValueOnce(queryStub({ email: 'pm@example.com', firstName: 'Anna', lastName: 'Meier' }))
        .mockReturnValueOnce(queryStub({ firstName: 'Beat', lastName: 'Schmid' }));

      const data = {
        projectId: 'proj-1',
        fromStatus: 'PLANNING',
        toStatus: 'IN_PROGRESS',
        comment: 'Freigabe erteilt',
        changedBy: ACTOR_ID,
      };

      const result = await worker.process(makeJob('send-status-notification', data));

      expect(mockSendProjectStatusNotification).toHaveBeenCalledTimes(1);
      expect(mockSendProjectStatusNotification).toHaveBeenCalledWith(
        'pm@example.com',
        expect.objectContaining({
          recipientName: 'Anna Meier',
          projectName: 'Neuinstallation Bern',
          projectNumber: 'P-2024-042',
          fromStatus: 'PLANNING',
          toStatus: 'IN_PROGRESS',
          changedBy: 'Beat Schmid',
          comment: 'Freigabe erteilt',
          projectUrl: '',
        }),
      );
      expect(result).toEqual({ sent: true, jobType: 'send-status-notification', recipients: ['pm@example.com'] });
    });

    it('fans out to the project manager and every configured CC recipient (PROJ-002 AC-6)', async () => {
      mockSendProjectStatusNotification.mockResolvedValue({});

      mockProjectFindById.mockReturnValue(
        queryStub({
          _id: 'proj-1',
          name: 'Neuinstallation Bern',
          projectNumber: 'P-2024-042',
          projectManagerId: PM_ID,
        }),
      );
      mockUserFindById
        .mockReturnValueOnce(queryStub({ email: 'pm@example.com', firstName: 'Anna', lastName: 'Meier' }))
        .mockReturnValueOnce(queryStub({ firstName: 'Beat', lastName: 'Schmid' }));

      const result = await worker.process(makeJob('send-status-notification', {
        projectId: 'proj-1',
        fromStatus: 'PLANNING',
        toStatus: 'IN_PROGRESS',
        changedBy: ACTOR_ID,
        ccRecipients: ['ops@example.com', 'lead@example.com', 'pm@example.com'],
      }));

      // PM + 2 distinct CCs (the duplicate pm@ is deduped) → 3 sends
      expect(mockSendProjectStatusNotification).toHaveBeenCalledTimes(3);
      const sentTo = mockSendProjectStatusNotification.mock.calls.map((c) => c[0]).sort();
      expect(sentTo).toEqual(['lead@example.com', 'ops@example.com', 'pm@example.com']);
      expect(result.sent).toBe(true);
      expect(result.recipients.sort()).toEqual(['lead@example.com', 'ops@example.com', 'pm@example.com']);
    });

    it('still notifies configured CCs even when the actor is the project manager', async () => {
      mockSendProjectStatusNotification.mockResolvedValue({});
      mockProjectFindById.mockReturnValue(
        queryStub({ _id: 'proj-2', name: 'X', projectNumber: 'P-2', projectManagerId: ACTOR_ID }),
      );
      // actor lookup (for the "changed by" name) — PM is the actor here
      mockUserFindById.mockReturnValue(queryStub({ firstName: 'Self', lastName: 'PM' }));

      const result = await worker.process(makeJob('send-status-notification', {
        projectId: 'proj-2', fromStatus: 'DRAFT', toStatus: 'PLANNING', changedBy: ACTOR_ID,
        ccRecipients: ['ops@example.com'],
      }));

      expect(mockSendProjectStatusNotification).toHaveBeenCalledTimes(1);
      expect(mockSendProjectStatusNotification.mock.calls[0][0]).toBe('ops@example.com');
      expect(result.recipients).toEqual(['ops@example.com']);
    });

    it('returns skipped when projectManagerId equals changedBy (actor IS the PM)', async () => {
      mockProjectFindById.mockReturnValue(
        queryStub({
          _id: 'proj-2',
          name: 'Renovation Zürich',
          projectNumber: 'P-2024-099',
          projectManagerId: ACTOR_ID, // same as changedBy
        }),
      );

      const data = {
        projectId: 'proj-2',
        fromStatus: 'DRAFT',
        toStatus: 'PLANNING',
        changedBy: ACTOR_ID,
      };

      const result = await worker.process(makeJob('send-status-notification', data));

      expect(mockSendProjectStatusNotification).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: 'no_distinct_recipient' });
    });

    it('returns skipped when project is not found', async () => {
      mockProjectFindById.mockReturnValue(queryStub(null));

      const result = await worker.process(
        makeJob('send-status-notification', { projectId: 'nonexistent', changedBy: ACTOR_ID }),
      );

      expect(mockSendProjectStatusNotification).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: 'project_not_found' });
    });

    it('returns skipped when PM has no email', async () => {
      mockProjectFindById.mockReturnValue(
        queryStub({ _id: 'proj-3', name: 'X', projectNumber: 'P-3', projectManagerId: PM_ID }),
      );
      mockUserFindById.mockReturnValueOnce(queryStub({ email: null, firstName: 'No', lastName: 'Email' }));

      const result = await worker.process(
        makeJob('send-status-notification', { projectId: 'proj-3', changedBy: ACTOR_ID }),
      );

      expect(mockSendProjectStatusNotification).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: 'no_recipient_email' });
    });
  });
});
