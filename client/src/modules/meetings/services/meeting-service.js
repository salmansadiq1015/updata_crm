import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const meetingService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.MEETINGS.LIST, { params });
    return res;
  },

  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.MEETINGS.BY_ID(id));
    return res.data;
  },

  async create(data) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.LIST, data);
    return res.data;
  },

  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.MEETINGS.BY_ID(id), data);
    return res.data;
  },

  async remove(id) {
    const res = await apiClient.delete(ENDPOINTS.MEETINGS.BY_ID(id));
    return res.data;
  },

  async cancel(id, data = {}) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.CANCEL(id), data);
    return res.data;
  },

  async rsvp(id, rsvpStatus) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.RSVP(id), { rsvpStatus });
    return res.data;
  },

  async updateAttendance(id, attendees) {
    const res = await apiClient.patch(ENDPOINTS.MEETINGS.ATTENDANCE(id), { attendees });
    return res.data;
  },

  async addNote(id, data) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.NOTES(id), data);
    return res.data;
  },

  async updateMinutes(id, data) {
    const res = await apiClient.patch(ENDPOINTS.MEETINGS.MINUTES(id), data);
    return res.data;
  },

  async addDecision(id, data) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.DECISIONS(id), data);
    return res.data;
  },

  async createTask(id, data) {
    const res = await apiClient.post(ENDPOINTS.MEETINGS.TASKS(id), data);
    return res.data;
  },

  async listFiles(meetingId) {
    const res = await apiClient.get(ENDPOINTS.FILES.LIST, {
      params: {
        module: 'meetings',
        entityType: 'Meeting',
        entityId: meetingId,
        bucket: 'documents',
        limit: 50,
      },
    });
    return res.data || [];
  },

  async uploadFile(meetingId, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('module', 'meetings');
    formData.append('entityType', 'Meeting');
    formData.append('entityId', meetingId);
    formData.append('bucket', 'documents');
    formData.append('category', 'meeting');

    const res = await apiClient.post(ENDPOINTS.FILES.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async getFileDownloadUrl(fileId) {
    const res = await apiClient.get(ENDPOINTS.FILES.DOWNLOAD(fileId));
    return res.data?.url || null;
  },
};
