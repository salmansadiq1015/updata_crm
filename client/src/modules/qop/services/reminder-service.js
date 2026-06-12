import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.QOP;

export const reminderService = {
  listAppointmentReminders: (params = {}) => apiClient.get(E.APPOINTMENT_REMINDERS, { params }),
  createAppointmentReminder: (data) => apiClient.post(E.APPOINTMENT_REMINDERS, data),
  updateAppointmentReminderStatus: (id, data) => apiClient.patch(E.APPOINTMENT_REMINDER_STATUS(id), data),
  getSettings: () => apiClient.get(E.REMINDER_SETTINGS),
  updateSettings: (data) => apiClient.put(E.REMINDER_SETTINGS, data),
};
