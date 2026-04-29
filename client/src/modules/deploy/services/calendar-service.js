import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const calendarService = {
  async getCalendar(params = {}) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.CALENDAR, { params });
    return res;
  },
};
