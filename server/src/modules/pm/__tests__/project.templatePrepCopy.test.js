import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

const mockProjectRepo = {
  findById: jest.fn(),
  create: jest.fn(),
};
jest.unstable_mockModule('../project.repository.js', () => ({ default: mockProjectRepo }));

// mock crm/customer.model (lazily imported by _resolveCustomerName)
jest.unstable_mockModule('../../crm/customer.model.js', () => ({
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ name: 'Acme AG' }) }) })) },
}));

jest.unstable_mockModule('../counter.service.js', () => ({
  default: { getNextProjectNumber: jest.fn().mockResolvedValue('PRJ-2026-00002') },
}));
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: { getOrSet: jest.fn(async (_k, p) => p()), del: jest.fn(), invalidatePattern: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({ default: { publish: jest.fn() } }));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: { PROJECT_CREATED: 'PROJECT_CREATED' },
}));
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../config/index.js', () => ({ default: { redis: { keyPrefix: 'test:' } } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockScheduleRepo = { findByProjectId: jest.fn().mockResolvedValue([]), create: jest.fn() };
jest.unstable_mockModule('../schedule.repository.js', () => ({ default: mockScheduleRepo }));

jest.unstable_mockModule('../../tasks/task.model.js', () => ({
  default: {
    find: jest.fn(() => ({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    })),
  },
}));

jest.unstable_mockModule('../../tasks/task.service.js', () => ({
  default: {
    create: jest.fn(),
    createSubtask: jest.fn(),
  },
}));

const mockPrepCreate = jest.fn();
const mockPrepFindByProjectId = jest.fn();
jest.unstable_mockModule('../prepAction.repository.js', () => ({
  default: { findByProjectId: mockPrepFindByProjectId, create: mockPrepCreate },
}));

let projectService;

beforeAll(async () => {
  projectService = (await import('../project.service.js')).default;
});

afterEach(() => jest.clearAllMocks());

describe('createFromTemplate — prep action sub-detail copy (PROJ-003 AF-1)', () => {
  it('carries funding details, externalReference and assignedToId into the cloned action', async () => {
    mockProjectRepo.findById
      .mockResolvedValueOnce({ _id: 'tpl', name: 'Tpl', projectType: 'NEW_INSTALLATION', currency: 'CHF' })
      .mockResolvedValue({ _id: 'new-proj' });
    mockProjectRepo.create.mockResolvedValue({ _id: 'new-proj' });

    mockPrepFindByProjectId.mockResolvedValue([
      {
        actionType: 'FUNDING_APPLICATION',
        title: 'Förderantrag Bund',
        description: 'Apply for federal funding',
        isMandatory: true,
        assignedToId: 'user-7',
        externalReference: 'FND-001',
        fundingDetails: {
          fundingBody: 'Bundesamt für Energie',
          applicationAmount: 25000,
          approvedAmount: 12000,
          submissionDate: new Date('2026-01-01'),
          fundingStatus: 'APPROVED',
        },
      },
    ]);

    await projectService.createFromTemplate('tpl', { name: 'Clone' }, 'user-1', {});

    expect(mockPrepCreate).toHaveBeenCalledTimes(1);
    const arg = mockPrepCreate.mock.calls[0][0];
    expect(arg).toMatchObject({
      projectId: 'new-proj',
      actionType: 'FUNDING_APPLICATION',
      title: 'Förderantrag Bund',
      isMandatory: true,
      assignedToId: 'user-7',
      externalReference: 'FND-001',
    });
    // Structured funding template values are carried…
    expect(arg.fundingDetails).toMatchObject({
      fundingBody: 'Bundesamt für Energie',
      applicationAmount: 25000,
    });
    // …but instance-specific decision fields are reset for the fresh project.
    expect(arg.fundingDetails.fundingStatus).toBe('DRAFT');
    expect(arg.fundingDetails.approvedAmount).toBeNull();
    expect(arg.fundingDetails.submissionDate).toBeNull();
    // dueDate is intentionally reset.
    expect(arg.dueDate).toBeNull();
  });

  it('carries material order details with delivery status reset', async () => {
    mockProjectRepo.findById
      .mockResolvedValueOnce({ _id: 'tpl', name: 'Tpl', projectType: 'RENOVATION', currency: 'CHF' })
      .mockResolvedValue({ _id: 'new-proj' });
    mockProjectRepo.create.mockResolvedValue({ _id: 'new-proj' });

    mockPrepFindByProjectId.mockResolvedValue([
      {
        actionType: 'MATERIAL_ORDER',
        title: 'Order pipes',
        isMandatory: false,
        materialOrderDetails: {
          supplier: 'ACME Supplies',
          orderReference: 'PO-999',
          orderDate: new Date('2026-02-02'),
          deliveryStatus: 'DELIVERED',
          items: [{ description: 'Copper pipe', quantity: 10, unit: 'm' }],
        },
      },
    ]);

    await projectService.createFromTemplate('tpl', {}, 'user-1', {});

    const arg = mockPrepCreate.mock.calls[0][0];
    expect(arg.materialOrderDetails).toMatchObject({
      supplier: 'ACME Supplies',
      items: [{ description: 'Copper pipe', quantity: 10, unit: 'm' }],
    });
    expect(arg.materialOrderDetails.deliveryStatus).toBe('PENDING');
    expect(arg.materialOrderDetails.orderReference).toBeNull();
    expect(arg.materialOrderDetails.orderDate).toBeNull();
  });
});
