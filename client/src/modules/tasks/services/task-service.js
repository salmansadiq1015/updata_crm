import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const taskService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TASKS.LIST, { params });
    return res.data;
  },

  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.TASKS.BY_ID(id));
    return res.data;
  },

  async listByOrder(orderId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.TASKS.ORDER_TASKS(orderId), { params });
    return res.data;
  },

  async create(data) {
    const res = await apiClient.post(ENDPOINTS.TASKS.LIST, data);
    return res.data;
  },

  async update(id, data) {
    const res = await apiClient.put(ENDPOINTS.TASKS.BY_ID(id), data);
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.TASKS.BY_ID(id));
    return res.data;
  },

  async changeStatus(id, status) {
    const res = await apiClient.patch(ENDPOINTS.TASKS.STATUS(id), { status });
    return res.data;
  },

  async complete(id, completeSubtasks = false) {
    const res = await apiClient.patch(ENDPOINTS.TASKS.COMPLETE(id), { completeSubtasks });
    return res.data;
  },

  async reopen(id) {
    const res = await apiClient.patch(ENDPOINTS.TASKS.REOPEN(id));
    return res.data;
  },

  async createSubtask(parentId, data) {
    const res = await apiClient.post(ENDPOINTS.TASKS.SUBTASKS(parentId), data);
    return res.data;
  },

  async getSubtasks(parentId) {
    const res = await apiClient.get(ENDPOINTS.TASKS.SUBTASKS(parentId));
    return res.data;
  },

  async bulk(action, taskIds, data = {}) {
    const res = await apiClient.post(ENDPOINTS.TASKS.BULK, { action, taskIds, data });
    return res.data;
  },

  async getDashboard(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TASKS.DASHBOARD, { params });
    return res.data;
  },

  async getStats(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TASKS.DASHBOARD_STATS, { params });
    return res.data;
  },

  // Notes
  async listNotes(taskId) {
    const res = await apiClient.get(ENDPOINTS.TASKS.NOTES(taskId));
    return res.data;
  },

  async createNote(taskId, content) {
    const res = await apiClient.post(ENDPOINTS.TASKS.NOTES(taskId), { content });
    return res.data;
  },

  async updateNote(taskId, noteId, content) {
    const res = await apiClient.put(ENDPOINTS.TASKS.NOTE_BY_ID(taskId, noteId), { content });
    return res.data;
  },

  async deleteNote(taskId, noteId) {
    const res = await apiClient.delete(ENDPOINTS.TASKS.NOTE_BY_ID(taskId, noteId));
    return res.data;
  },
};
