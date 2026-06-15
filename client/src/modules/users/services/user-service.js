import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const id = raw._id || raw.id;
  return { ...raw, _id: id, id };
}

function normalizeUserList(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.results)
    ? payload.results
    : [];

  return items.map(normalizeUser).filter((user) => user?._id);
}

export const userService = {
  async getUsers(params = {}) {
    const res = await apiClient.get(ENDPOINTS.USERS.LIST, { params });
    return res;
  },

  async getDirectory(params = {}) {
    const res = await apiClient.get(ENDPOINTS.USERS.DIRECTORY, { params });
    return normalizeUserList(res?.data);
  },

  async getUserById(id) {
    const res = await apiClient.get(ENDPOINTS.USERS.BY_ID(id));
    return res.data;
  },

  async createUser(data) {
    const res = await apiClient.post(ENDPOINTS.USERS.LIST, data);
    return res.data;
  },

  async updateUser(id, data) {
    const res = await apiClient.put(ENDPOINTS.USERS.BY_ID(id), data);
    return res.data;
  },

  async deactivateUser(id) {
    const res = await apiClient.patch(ENDPOINTS.USERS.DEACTIVATE(id));
    return res.data;
  },

  async activateUser(id) {
    const res = await apiClient.patch(ENDPOINTS.USERS.ACTIVATE(id));
    return res.data;
  },

  // Avatar
  async uploadAvatar(userId, file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await apiClient.post(ENDPOINTS.USERS.AVATAR(userId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async removeAvatar(userId) {
    const res = await apiClient.delete(ENDPOINTS.USERS.AVATAR(userId));
    return res.data;
  },

  // Bulk operations
  async bulkUpdate(ids, data) {
    const res = await apiClient.patch(ENDPOINTS.USERS.BULK_UPDATE, { ids, data });
    return res.data;
  },

  async bulkDelete(ids) {
    const res = await apiClient.post(ENDPOINTS.USERS.BULK_DELETE, { ids });
    return res.data;
  },

  // Sessions (admin)
  async getUserSessions(userId) {
    const res = await apiClient.get(ENDPOINTS.USERS.SESSIONS(userId));
    return res.data;
  },

  async revokeUserSessions(userId) {
    const res = await apiClient.delete(ENDPOINTS.USERS.SESSIONS(userId));
    return res.data;
  },
};
