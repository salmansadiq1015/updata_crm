import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function downloadBlob(blob, filename) {
  if (typeof window === 'undefined') return;
  const href = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(href);
}

export const timeTrackingService = {
  async getOverview(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.OVERVIEW, { params });
    return res.data;
  },

  async getTimeEntries(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.TIME_ENTRIES, { params });
    return asArray(res.data);
  },

  async getTimeEntriesByOrder(orderId) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.ORDER_TIME_ENTRIES(orderId));
    return asArray(res.data);
  },

  async createTimeEntry(orderId, data) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.ORDER_TIME_ENTRIES(orderId), data);
    return res.data;
  },

  async updateTimeEntry(entryId, data) {
    const res = await apiClient.put(ENDPOINTS.TIME_TRACKING.TIME_ENTRY_BY_ID(entryId), data);
    return res.data;
  },

  async deleteTimeEntry(entryId) {
    const res = await apiClient.delete(ENDPOINTS.TIME_TRACKING.TIME_ENTRY_BY_ID(entryId));
    return res.data;
  },

  async releaseTimeEntry(entryId) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.TIME_ENTRY_RELEASE(entryId));
    return res.data;
  },

  async overrideTimeEntry(entryId, justification) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.TIME_ENTRY_OVERRIDE(entryId), { justification });
    return res.data;
  },

  async exportTimeEntries(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.TIME_ENTRIES_EXPORT, {
      params,
      responseType: 'blob',
    });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const disposition = res.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `time-records-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(blob, filename);
    return { filename };
  },

  async getLeaveRequests(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.LEAVE_REQUESTS, { params });
    return asArray(res.data);
  },

  async createLeaveRequest(data) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.LEAVE_REQUESTS, data);
    return res.data;
  },

  async approveLeaveRequest(id, data = {}) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.LEAVE_APPROVE(id), data);
    return res.data;
  },

  async rejectLeaveRequest(id, decisionNote) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.LEAVE_REJECT(id), { decisionNote });
    return res.data;
  },

  async cancelLeaveRequest(id) {
    const res = await apiClient.post(ENDPOINTS.TIME_TRACKING.LEAVE_CANCEL(id));
    return res.data;
  },

  async getVacationBalances(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.BALANCES, { params });
    return asArray(res.data);
  },

  async upsertVacationBalance(employeeId, year, data) {
    const res = await apiClient.put(ENDPOINTS.TIME_TRACKING.BALANCE_BY_EMPLOYEE_YEAR(employeeId, year), data);
    return res.data;
  },

  async getCalendar(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.CALENDAR, { params });
    return res.data;
  },

  async getAnalytics(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.ANALYTICS, { params });
    return res.data;
  },

  async getAiContext(params = {}) {
    const res = await apiClient.get(ENDPOINTS.TIME_TRACKING.AI_CONTEXT, { params });
    return res.data;
  },
};
