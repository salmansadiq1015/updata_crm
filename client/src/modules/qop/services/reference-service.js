import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const referenceService = {
  searchCustomers: (query) => apiClient.get(ENDPOINTS.CRM.CUSTOMERS, {
    params: { q: query, limit: 10 },
  }),
  listDepartments: () => apiClient.get('/admin/departments'),
  listCustomerProjects: (customerId) => apiClient.get(ENDPOINTS.PM.PROJECTS, {
    params: { customerId, limit: 50, status: 'ACTIVE' },
  }),
};
