import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const reportService = {
  async getReportsByOrder(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_REPORTS(orderId));
    return res.data;
  },

  async createReport(orderId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.ORDER_REPORTS(orderId), data);
    return res.data;
  },

  async getReport(reportId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId));
    return res.data;
  },

  async updateReport(reportId, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId), data);
    return res.data;
  },

  async submitReport(reportId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_SUBMIT(reportId));
    return res.data;
  },
};
