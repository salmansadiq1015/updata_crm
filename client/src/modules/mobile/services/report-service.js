import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const reportService = {
  async getReportsByOrder(orderId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.ORDER_REPORTS(orderId));
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  },

  async getAllReports(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.REPORTS, { params: filters });
    return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
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

  async deleteReport(reportId) {
    const res = await apiClient.delete(ENDPOINTS.MOBILE.REPORT_BY_ID(reportId));
    return res.data;
  },

  async bulkDeleteReports(ids) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORTS_BULK_DELETE, { ids });
    return res.data;
  },

  async archiveReport(reportId) {
    const res = await apiClient.patch(ENDPOINTS.MOBILE.REPORT_ARCHIVE(reportId));
    return res.data;
  },

  async unarchiveReport(reportId) {
    const res = await apiClient.patch(ENDPOINTS.MOBILE.REPORT_UNARCHIVE(reportId));
    return res.data;
  },

  async bulkArchiveReports(ids) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORTS_BULK_ARCHIVE, { ids });
    return res.data;
  },

  async submitReport(reportId) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.REPORT_SUBMIT(reportId));
    return res.data;
  },
};
