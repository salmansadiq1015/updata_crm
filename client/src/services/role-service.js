import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const roleService = {
  async getRoles(params = {}) {
    const res = await apiClient.get(ENDPOINTS.ROLES.LIST, { params });
    return res;
  },

  async getRoleById(id) {
    const res = await apiClient.get(ENDPOINTS.ROLES.BY_ID(id));
    return res.data;
  },

  async createRole(data) {
    const res = await apiClient.post(ENDPOINTS.ROLES.LIST, data);
    return res.data;
  },

  async updateRole(id, data) {
    const res = await apiClient.put(ENDPOINTS.ROLES.BY_ID(id), data);
    return res.data;
  },

  async deleteRole(id) {
    const res = await apiClient.delete(ENDPOINTS.ROLES.BY_ID(id));
    return res.data;
  },

  async getPermissions() {
    const res = await apiClient.get(ENDPOINTS.ROLES.PERMISSIONS);
    return res.data;
  },
};
