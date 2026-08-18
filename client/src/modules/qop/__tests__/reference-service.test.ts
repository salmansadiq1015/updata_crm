import { beforeEach, describe, expect, test, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/client', () => ({
  default: {
    get: getMock,
  },
}));

vi.mock('@/lib/api/endpoints', () => ({
  ENDPOINTS: {
    CRM: {
      CUSTOMERS: '/crm/customers',
    },
    PM: {
      PROJECTS: '/pm/projects',
    },
  },
}));

describe('qop reference service', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  test('loads active departments from the admin department reference endpoint', async () => {
    const { referenceService } = await import('../services/reference-service');

    referenceService.listDepartments();

    expect(getMock).toHaveBeenCalledWith('/admin/departments', { params: { scope: 'qop' } });
  });

  test('loads customer projects with valid selectable project status filters', async () => {
    const { referenceService } = await import('../services/reference-service');

    referenceService.listCustomerProjects('customer-1', ' boiler ');

    expect(getMock).toHaveBeenCalledWith('/pm/projects', {
      params: {
        customerId: 'customer-1',
        limit: 50,
        status: 'DRAFT,PLANNING,SCHEDULED,WAITING_FOR_MATERIAL,IN_PROGRESS,AWAITING_CUSTOMER_APPROVAL,AWAITING_QUOTATION_APPROVAL,ON_HOLD',
        sortBy: 'projectNumber',
        sortOrder: 'asc',
        search: 'boiler',
      },
    });
    expect(getMock.mock.calls[0]?.[1]?.params.status).not.toBe('ACTIVE');
  });

  test('omits blank project search terms', async () => {
    const { referenceService } = await import('../services/reference-service');

    referenceService.listCustomerProjects('customer-1', '   ');

    expect(getMock).toHaveBeenCalledWith('/pm/projects', {
      params: {
        customerId: 'customer-1',
        limit: 50,
        status: 'DRAFT,PLANNING,SCHEDULED,WAITING_FOR_MATERIAL,IN_PROGRESS,AWAITING_CUSTOMER_APPROVAL,AWAITING_QUOTATION_APPROVAL,ON_HOLD',
        sortBy: 'projectNumber',
        sortOrder: 'asc',
      },
    });
  });
});
