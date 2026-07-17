import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { QOP_SELECTABLE_PROJECT_STATUSES } from '../constants/qop-constants';

export const referenceService = {
  searchCustomers: (query) => apiClient.get(ENDPOINTS.CRM.CUSTOMERS, {
    params: { q: query, limit: 10 },
  }),
  listDepartments: () => apiClient.get('/admin/departments'),
  // Admin management view: include deactivated ones so they can be reactivated
  // (the QOP form dropdowns keep using listDepartments = active only).
  listAllDepartments: () => apiClient.get('/admin/departments', { params: { includeInactive: true } }),
  createDepartment: (data) => apiClient.post('/admin/departments', data),
  updateDepartment: (id, data) => apiClient.patch(`/admin/departments/${id}`, data),
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
