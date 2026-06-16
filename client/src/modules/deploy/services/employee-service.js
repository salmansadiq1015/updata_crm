import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function normalizeEmployee(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const id = raw._id || raw.id;
  return { ...raw, _id: id, id };
}

export const deployEmployeeService = {
  async listEmployees(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.EMPLOYEES, { params });
    const items = Array.isArray(res?.data) ? res.data : [];
    return items.map(normalizeEmployee).filter((employee) => employee?._id);
  },
};
