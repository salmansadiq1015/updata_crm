import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.USERS;

export const calendarSyncService = {
  status: () => apiClient.get(E.CALENDAR_STATUS),
  connect: (provider) => apiClient.post(E.CALENDAR_CONNECT, { provider }),
  disconnect: (provider) => apiClient.post(E.CALENDAR_DISCONNECT, { provider }),
};
