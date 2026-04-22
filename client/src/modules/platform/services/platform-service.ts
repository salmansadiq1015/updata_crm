import apiClient from '@/lib/api/client';

export const platformService = {
  async getSystemHealth() {
    const res = await apiClient.get('/system/health');
    return res.data;
  },

  async getJobs(params?: { queue?: string; status?: string; page?: number; limit?: number }) {
    const res = await apiClient.get('/system/jobs', { params });
    return res;
  },

  async getFiles(params?: { bucket?: string; page?: number; limit?: number }) {
    const res = await apiClient.get('/files', { params });
    return res;
  },

  async deleteFile(fileId: string) {
    const res = await apiClient.delete(`/files/${fileId}`);
    return res.data;
  },
};
