import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';
import Cookies from 'js-cookie';

const REFRESH_COOKIE = 'mb_refresh_token';

export const authService = {
  async login(email, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.LOGIN, { email, password });
    const { accessToken, refreshToken, user } = res.data;

    useAuthStore.getState().setAuth(user, accessToken);
    Cookies.set(REFRESH_COOKIE, refreshToken, { path: '/', sameSite: 'strict' });

    return res.data;
  },

  async refreshToken() {
    const refreshToken = Cookies.get(REFRESH_COOKIE);
    if (!refreshToken) {
      useAuthStore.getState().clearAuth();
      throw new Error('No refresh token available');
    }

    try {
      const res = await apiClient.post(ENDPOINTS.AUTH.REFRESH, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken, user } = res.data;

      useAuthStore.getState().setAuth(user, accessToken);
      if (newRefreshToken) {
        Cookies.set(REFRESH_COOKIE, newRefreshToken, { path: '/', sameSite: 'strict' });
      }
      return res.data;
    } catch (err) {
      useAuthStore.getState().clearAuth();
      Cookies.remove(REFRESH_COOKIE);
      throw err;
    }
  },

  async logout() {
    try {
      await apiClient.post(ENDPOINTS.AUTH.LOGOUT);
    } catch {
      // Ignore logout API errors — clear local state regardless
    } finally {
      useAuthStore.getState().clearAuth();
      Cookies.remove(REFRESH_COOKIE);
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

  // Account activation
  async activate(token, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.ACTIVATE, { token, password });
    return res.data;
  },

  // Password reset
  async requestPasswordReset(email) {
    const res = await apiClient.post(ENDPOINTS.AUTH.RESET_REQUEST, { email });
    return res.data;
  },

  async confirmPasswordReset(token, password) {
    const res = await apiClient.post(ENDPOINTS.AUTH.RESET_CONFIRM, { token, password });
    return res.data;
  },

  // Session management
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

  // Audit log
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
