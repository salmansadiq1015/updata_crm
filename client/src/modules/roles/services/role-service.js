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
    const res = await apiClient.patch(ENDPOINTS.ROLES.BY_ID(id), data);
    return res.data;
  },

  async deleteRole(id) {
    const res = await apiClient.delete(ENDPOINTS.ROLES.BY_ID(id));
    return res.data;
  },

  async bulkDeleteRoles(ids) {
    const results = await Promise.allSettled(
      ids.map((id) => apiClient.delete(ENDPOINTS.ROLES.BY_ID(id)))
    );
    const deletedCount = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { deletedCount, failed };
  },

  async getPermissions() {
    const res = await apiClient.get(ENDPOINTS.ROLES.PERMISSIONS);
    return res.data;
  },
};
