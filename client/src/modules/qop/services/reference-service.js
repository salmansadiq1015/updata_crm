import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { QOP_SELECTABLE_PROJECT_STATUSES } from '../constants/qop-constants';

export const referenceService = {
  // Empty query -> default customer list (suggestions before typing); a query
  // filters server-side via `search` (the CRM list endpoint ignores `q`).
  searchCustomers: (query) => apiClient.get(ENDPOINTS.CRM.CUSTOMERS, {
    // Deactivated customers stay out of document dropdowns.
    params: { ...(query ? { search: query } : {}), status: 'active', limit: 10 },
  }),
  // Objekt-first flow: search sites globally, then load the chosen one to derive
  // the customer and to know which parties (Rechnungsadresse / Eigentümer /
  // Verwaltung) can be offered as the printed billing address.
  searchSites: (query) => apiClient.get(ENDPOINTS.CRM.SITES, {
    params: { ...(query ? { search: query } : {}), status: 'active', limit: 10 },
  }),
  getSite: (id) => apiClient.get(`${ENDPOINTS.CRM.SITES}/${id}`),
  getCustomer: (id) => apiClient.get(`${ENDPOINTS.CRM.CUSTOMERS}/${id}`),
  // QOP numbering only uses commercial departments (scope=qop) — the task board
  // has additional operational departments that must not appear in QOP forms.
  listDepartments: () => apiClient.get('/admin/departments', { params: { scope: 'qop' } }),
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
