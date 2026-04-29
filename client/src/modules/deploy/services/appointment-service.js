import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const appointmentService = {
  async getAppointment(assignmentId) {
    const res = await apiClient.get(ENDPOINTS.DEPLOY.APPOINTMENT(assignmentId));
    return res.data;
  },

  async updateAppointment(assignmentId, data) {
    const res = await apiClient.patch(ENDPOINTS.DEPLOY.APPOINTMENT(assignmentId), data);
    return res.data;
  },

  async confirmAppointment(assignmentId) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.APPOINTMENT_CONFIRM(assignmentId));
    return res.data;
  },

  async cancelAppointment(assignmentId, data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.APPOINTMENT_CANCEL(assignmentId), data);
    return res.data;
  },

  async rescheduleAppointment(assignmentId, data) {
    const res = await apiClient.post(ENDPOINTS.DEPLOY.APPOINTMENT_RESCHEDULE(assignmentId), data);
    return res.data;
  },
};
