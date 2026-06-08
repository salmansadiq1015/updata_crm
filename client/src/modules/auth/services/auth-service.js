import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';
import {
  clearStoredRefreshToken,
  refreshSession,
  storeRefreshToken,
} from './session-refresh-service';

export const authService = {
  async login(email, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.LOGIN, { email, password });
    const { accessToken, refreshToken, user } = res.data;

    useAuthStore.getState().setAuth(user, accessToken);
    storeRefreshToken(refreshToken);

    return res.data;
  },

  async refreshToken() {
    return refreshSession();
  },

  async logout() {
    try {
      await apiClient.post(ENDPOINTS.AUTH.LOGOUT);
    } catch {
      // Ignore logout API errors; clear local state regardless.
    } finally {
      useAuthStore.getState().clearAuth();
      clearStoredRefreshToken();
    }
  },

  async fetchMe() {
    const res = await apiClient.get(ENDPOINTS.AUTH.ME);
    useAuthStore.getState().setUser(res.data);
    return res.data;
  },

  async changePassword(data) {
    const res = await apiClient.post(ENDPOINTS.AUTH.CHANGE_PASSWORD, data);
    return res.data;
  },

  async activate(token, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.ACTIVATE, { token, password });
    return res.data;
  },

  async requestPasswordReset(email) {
    const res = await apiClient.post(ENDPOINTS.AUTH.RESET_REQUEST, { email });
    return res.data;
  },

  async confirmPasswordReset(token, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.RESET_CONFIRM, { token, password });
    return res.data;
  },

  async listSessions() {
    const res = await apiClient.get(ENDPOINTS.AUTH.SESSIONS);
    return res.data;
  },

  async revokeSession(sessionId) {
    const res = await apiClient.delete(ENDPOINTS.AUTH.SESSION_BY_ID(sessionId));
    return res.data;
  },

  async revokeOtherSessions() {
    const res = await apiClient.post(ENDPOINTS.AUTH.SESSIONS_REVOKE_OTHERS);
    return res.data;
  },

  async getAuditLog(params = {}) {
    const res = await apiClient.get(ENDPOINTS.AUTH.AUDIT, { params });
    return res;
  },

  async exportAuditLog(params = {}) {
    const res = await apiClient.get(ENDPOINTS.AUTH.AUDIT_EXPORT, {
      params,
      responseType: 'blob',
    });
    return res;
  },
};
