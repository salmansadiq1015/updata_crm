import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { QOP_SELECTABLE_PROJECT_STATUSES } from '../constants/qop-constants';

export const referenceService = {
  searchCustomers: (query) => apiClient.get(ENDPOINTS.CRM.CUSTOMERS, {
    params: { q: query, limit: 10 },
  }),
  listDepartments: () => apiClient.get('/admin/departments'),
  listCustomerProjects: (customerId, search = '') => {
    const trimmedSearch = String(search || '').trim();
    return apiClient.get(ENDPOINTS.PM.PROJECTS, {
      params: {
        customerId,
        limit: 50,
        status: QOP_SELECTABLE_PROJECT_STATUSES.join(','),
        sortBy: 'projectNumber',
        sortOrder: 'asc',
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      },
    });
  },
};
