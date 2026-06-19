import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  createMeetingSchema,
  updateMeetingSchema,
} from '../meeting.validation.js';

const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockFindRawById = jest.fn();
const mockUpdateById = jest.fn();
const mockEventPublish = jest.fn();
const mockAuditLog = jest.fn();
const mockCacheDel = jest.fn();
const mockCacheInvalidatePattern = jest.fn();
const mockScheduledCreate = jest.fn();

jest.unstable_mockModule('../meeting.repository.js', () => ({
  default: {
    create: mockCreate,
    findById: mockFindById,
    findRawById: mockFindRawById,
    updateById: mockUpdateById,
  },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: mockEventPublish },
}));

jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    MEETING_CREATED: 'meeting.created',
    MEETING_UPDATED: 'meeting.updated',
    MEETING_CANCELLED: 'meeting.cancelled',
    MEETING_RSVP_UPDATED: 'meeting.rsvp_updated',
    MEETING_TASK_CREATED: 'meeting.task_created',
  },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockAuditLog },
}));

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    del: mockCacheDel,
    invalidatePattern: mockCacheInvalidatePattern,
  },
}));

jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.unstable_mockModule('../../notifications/scheduledNotification.service.js', () => ({
  default: { create: mockScheduledCreate },
}));

let meetingService;

const creatorId = '665f1d5f0f1d5f0f1d5f0001';
const attendeeId = '665f1d5f0f1d5f0f1d5f0002';
const meetingId = '665f1d5f0f1d5f0f1d5f0003';

beforeAll(async () => {
  process.env.CLIENT_URI = 'https://app.example.test';
  meetingService = (await import('../meeting.service.js')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheDel.mockResolvedValue(undefined);
  mockCacheInvalidatePattern.mockResolvedValue(undefined);
});

function meetingPayload(overrides = {}) {
  return {
    _id: meetingId,
    title: 'Projekt Kickoff',
    agenda: 'Scope, dates, responsibilities',
    startAt: new Date('2026-07-01T10:00:00.000Z'),
    endAt: new Date('2026-07-01T11:00:00.000Z'),
    participants: [
      { userId: creatorId, role: 'ORGANIZER', rsvpStatus: 'ACCEPTED' },
      { userId: attendeeId, role: 'RESPONSIBLE', rsvpStatus: 'PENDING' },
    ],
    onlineMeeting: {
      provider: 'INTERNAL',
      joinUrl: 'https://app.example.test/scheduling/meetings?meetingId=665f1d5f0f1d5f0f1d5f0003&join=1',
      createdInSystem: true,
    },
    reminders: [{ minutesBefore: 60, status: 'PENDING' }],
    ...overrides,
  };
}

describe('meeting validation', () => {
  test('accepts internal meetings with users, external invitees, links, and reminders', () => {
    const { error, value } = createMeetingSchema.body.validate({
      title: 'Projekt Kickoff',
      agenda: 'Scope and next steps',
      startAt: '2026-07-01T10:00:00.000Z',
      endAt: '2026-07-01T11:00:00.000Z',
      onlineMeeting: { provider: 'INTERNAL' },
      participants: [
        { userId: attendeeId, role: 'RESPONSIBLE' },
        { email: 'external@example.com', displayName: 'External Partner', role: 'OPTIONAL' },
      ],
      projectId: '665f1d5f0f1d5f0f1d5f0004',
      customerId: '665f1d5f0f1d5f0f1d5f0005',
      taskIds: ['665f1d5f0f1d5f0f1d5f0006'],
      reminderMinutesBefore: [1440, 60],
    }, { abortEarly: false });

    expect(error).toBeUndefined();
    expect(value.participants).toHaveLength(2);
    expect(value.onlineMeeting.provider).toBe('INTERNAL');
    expect(value.reminderMinutesBefore).toEqual([1440, 60]);
  });

  test('rejects meetings that end before they start', () => {
    const { error } = createMeetingSchema.body.validate({
      title: 'Invalid Meeting',
      startAt: '2026-07-01T11:00:00.000Z',
      endAt: '2026-07-01T10:00:00.000Z',
    });

    expect(error?.details?.[0]?.path).toEqual(['endAt']);
  });

  test('requires at least one changed field on update', () => {
    const { error } = updateMeetingSchema.body.validate({});

    expect(error?.details?.[0]?.type).toBe('object.min');
  });
});

describe('meetingService helpers', () => {
  test('deduplicates participants and adds the creator as accepted organizer', () => {
    const participants = meetingService._normalizeParticipants([
      { userId: attendeeId, role: 'RESPONSIBLE' },
      { userId: attendeeId, role: 'OPTIONAL' },
      { email: 'External@Example.com', displayName: 'External Partner' },
    ], creatorId);

    expect(participants).toHaveLength(3);
    expect(participants.find((participant) => participant.userId === attendeeId)).toEqual(expect.objectContaining({
      role: 'RESPONSIBLE',
      rsvpStatus: 'PENDING',
    }));
    expect(participants.find((participant) => participant.userId === creatorId)).toEqual(expect.objectContaining({
      role: 'ORGANIZER',
      rsvpStatus: 'ACCEPTED',
    }));
  });

  test('normalizes reminder offsets into bounded descending unique minutes', () => {
    expect(meetingService._normalizeReminderOffsets([15, 60, 15, -1, 10081, 0])).toEqual([60, 15, 0]);
    expect(meetingService._normalizeReminderOffsets([])).toEqual([1440, 60]);
  });
});

describe('meetingService.create', () => {
  test('creates internal join links, schedules reminders, and notifies invitees', async () => {
    mockCreate.mockResolvedValue({
      _id: { toString: () => meetingId },
      onlineMeeting: {
        provider: 'INTERNAL',
        joinUrl: '',
        toObject: () => ({ provider: 'INTERNAL', joinUrl: '', createdInSystem: true }),
      },
    });
    mockUpdateById.mockResolvedValue(meetingPayload());
    mockFindRawById.mockResolvedValue(meetingPayload());
    mockFindById.mockResolvedValue(meetingPayload());
    mockScheduledCreate.mockResolvedValue({ _id: '665f1d5f0f1d5f0f1d5f0007' });

    await meetingService.create({
      title: 'Projekt Kickoff',
      agenda: 'Scope, dates, responsibilities',
      startAt: '2026-07-01T10:00:00.000Z',
      endAt: '2026-07-01T11:00:00.000Z',
      participants: [{ userId: attendeeId, role: 'RESPONSIBLE' }],
      onlineMeeting: { provider: 'INTERNAL' },
      reminderMinutesBefore: [60],
    }, creatorId, {});

    expect(mockUpdateById).toHaveBeenCalledWith(meetingId, expect.objectContaining({
      onlineMeeting: expect.objectContaining({
        joinUrl: `https://app.example.test/scheduling/meetings?meetingId=${meetingId}&join=1`,
        createdInSystem: true,
      }),
    }));
    expect(mockScheduledCreate).toHaveBeenCalledWith(expect.objectContaining({
      notificationType: 'meeting_reminder',
      recipientIds: expect.arrayContaining([creatorId, attendeeId]),
      sourceEntityType: 'Meeting',
      sourceEntityId: meetingId,
    }), creatorId, {});
    expect(mockEventPublish).toHaveBeenCalledWith('meeting.created', expect.objectContaining({
      meetingId,
      recipientIds: [attendeeId],
      joinUrl: `https://app.example.test/scheduling/meetings?meetingId=${meetingId}&join=1`,
    }), { source: 'meetings' });
  });
});
