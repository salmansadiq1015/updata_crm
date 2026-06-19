import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

const mockRepository = {
  generateTicketNumber: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findWithCursor: jest.fn(),
  updateById: jest.fn(),
  softDelete: jest.fn(),
  findOverdueOpen: jest.fn(),
  getSummary: jest.fn(),
};

const mockCache = {
  getOrSet: jest.fn((_key, factory) => factory()),
  del: jest.fn(),
  invalidatePattern: jest.fn(),
};

const mockEventPublish = jest.fn();
const mockAuditLogEvent = jest.fn();

function chainResult(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

jest.unstable_mockModule('../fieldTicket.repository.js', () => ({
  default: mockRepository,
}));

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: mockCache,
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: mockEventPublish },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockAuditLogEvent },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../../auth/permission.model.js', () => ({
  default: { findOne: jest.fn(() => chainResult(null)) },
}));

jest.unstable_mockModule('../../auth/role.model.js', () => ({
  default: { find: jest.fn(() => chainResult([])) },
}));

jest.unstable_mockModule('../../auth/user.model.js', () => ({
  default: { find: jest.fn(() => chainResult([])) },
}));

let fieldTicketService;
let EVENT_TYPES;

beforeAll(async () => {
  fieldTicketService = (await import('../fieldTicket.service.js')).default;
  EVENT_TYPES = (await import('../../../shared/events/eventTypes.js')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRepository.generateTicketNumber.mockResolvedValue('FT-000001');
  mockCache.getOrSet.mockImplementation((_key, factory) => factory());
  mockCache.del.mockResolvedValue(undefined);
  mockCache.invalidatePattern.mockResolvedValue(undefined);
  mockRepository.getSummary.mockResolvedValue({ total: 0, byStatus: {}, byPriority: {}, overdue: 0, escalated: 0 });
});

describe('fieldTicketService', () => {
  it('creates tickets with automatic AI priority/category recommendation and escalation events', async () => {
    const userId = '665f1d5f0f1d5f0f1d5f0001';
    const ticketId = '665f1d5f0f1d5f0f1d5f1001';
    const createdTicket = {
      _id: ticketId,
      ticketNumber: 'FT-000001',
      title: 'Gas leak in boiler room',
      description: 'Customer reports gas smell and no heat.',
      type: 'TECHNICAL_NOTIFICATION',
      priority: 'CRITICAL',
      status: 'OPEN',
      createdBy: userId,
      assignedTo: null,
      escalated: true,
      ai: {
        category: 'INCIDENT',
        recommendedPriority: 'CRITICAL',
        nextActions: ['Contact the assigned technician immediately and confirm site safety.'],
      },
    };

    mockRepository.create.mockResolvedValue({ _id: ticketId });
    mockRepository.findById.mockResolvedValue(createdTicket);

    const result = await fieldTicketService.create({
      title: 'Gas leak in boiler room',
      description: 'Customer reports gas smell and no heat.',
    }, userId, { ipAddress: '127.0.0.1' });

    expect(result).toBe(createdTicket);
    expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      ticketNumber: 'FT-000001',
      priority: 'CRITICAL',
      escalated: true,
      escalationReason: 'CRITICAL_PRIORITY',
      ai: expect.objectContaining({
        category: 'INCIDENT',
        recommendedPriority: 'CRITICAL',
        nextActions: expect.any(Array),
      }),
      activity: expect.arrayContaining([
        expect.objectContaining({ type: 'CREATED' }),
        expect.objectContaining({ type: 'AI_RECOMMENDED' }),
        expect.objectContaining({ type: 'ESCALATED' }),
      ]),
    }));
    expect(mockEventPublish).toHaveBeenCalledWith(
      EVENT_TYPES.FIELD_TICKET_CREATED,
      expect.objectContaining({ ticketId, priority: 'CRITICAL' }),
      expect.objectContaining({ source: 'fieldTickets' }),
    );
    expect(mockEventPublish).toHaveBeenCalledWith(
      EVENT_TYPES.FIELD_TICKET_ESCALATED,
      expect.objectContaining({ ticketId, priority: 'CRITICAL' }),
      expect.objectContaining({ source: 'fieldTickets' }),
    );
    expect(mockAuditLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'fieldTicket.created',
      module: 'fieldTickets',
    }));
  });

  it('rejects invalid status transitions', async () => {
    const ticketId = '665f1d5f0f1d5f0f1d5f1001';
    mockRepository.findById.mockResolvedValue({
      _id: ticketId,
      title: 'Closed issue',
      status: 'COMPLETED',
      priority: 'LOW',
      createdBy: '665f1d5f0f1d5f0f1d5f0001',
    });

    await expect(fieldTicketService.changeStatus(
      ticketId,
      'PENDING',
      '665f1d5f0f1d5f0f1d5f0001',
    )).rejects.toMatchObject({ code: 'FIELD_TICKET_INVALID_TRANSITION' });

    expect(mockRepository.updateById).not.toHaveBeenCalled();
  });

  it('adds comments to ticket history and publishes comment events', async () => {
    const userId = '665f1d5f0f1d5f0f1d5f0001';
    const ticketId = '665f1d5f0f1d5f0f1d5f1001';
    const existing = {
      _id: ticketId,
      ticketNumber: 'FT-000004',
      title: 'Pump noise',
      status: 'OPEN',
      priority: 'MEDIUM',
      createdBy: '665f1d5f0f1d5f0f1d5f0002',
      assignedTo: userId,
    };
    const updated = { ...existing, comments: [{ body: 'Checked on site', authorId: userId }] };

    mockRepository.findById.mockResolvedValue(existing);
    mockRepository.updateById.mockResolvedValue(updated);

    const result = await fieldTicketService.addComment(ticketId, { body: 'Checked on site' }, userId);

    expect(result).toBe(updated);
    expect(mockRepository.updateById).toHaveBeenCalledWith(ticketId, {
      set: { updatedBy: userId },
      push: {
        comments: expect.objectContaining({ body: 'Checked on site', visibility: 'INTERNAL', authorId: userId }),
        activity: expect.objectContaining({ type: 'COMMENTED' }),
      },
    });
    expect(mockEventPublish).toHaveBeenCalledWith(
      EVENT_TYPES.FIELD_TICKET_COMMENTED,
      expect.objectContaining({ ticketId, ticketNumber: 'FT-000004' }),
      expect.objectContaining({ source: 'fieldTickets' }),
    );
  });

  it('escalates overdue open tickets idempotently', async () => {
    const now = new Date('2026-06-19T08:00:00.000Z');
    const ticket = {
      _id: '665f1d5f0f1d5f0f1d5f1001',
      ticketNumber: 'FT-000009',
      title: 'Overdue service request',
      status: 'OPEN',
      priority: 'MEDIUM',
      dueAt: new Date('2026-06-18T08:00:00.000Z'),
      createdBy: '665f1d5f0f1d5f0f1d5f0001',
      assignedTo: null,
    };
    const updated = { ...ticket, priority: 'HIGH', escalated: true, escalatedAt: now };

    mockRepository.findOverdueOpen.mockResolvedValue([ticket]);
    mockRepository.updateById.mockResolvedValue(updated);

    const result = await fieldTicketService.escalateOverdue(now);

    expect(result).toEqual({ escalatedCount: 1 });
    expect(mockRepository.findOverdueOpen).toHaveBeenCalledWith(now, 200);
    expect(mockRepository.updateById).toHaveBeenCalledWith(ticket._id, {
      set: expect.objectContaining({
        escalated: true,
        escalatedAt: now,
        escalationReason: 'OVERDUE_DUE_DATE',
        priority: 'HIGH',
      }),
      push: { activity: expect.objectContaining({ type: 'ESCALATED' }) },
    });
    expect(mockEventPublish).toHaveBeenCalledWith(
      EVENT_TYPES.FIELD_TICKET_ESCALATED,
      expect.objectContaining({ ticketId: ticket._id, priority: 'HIGH' }),
      expect.objectContaining({ source: 'fieldTickets' }),
    );
  });
});
