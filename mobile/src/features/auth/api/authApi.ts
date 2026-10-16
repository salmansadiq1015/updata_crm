import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import type { LoginValues } from '../schemas/authSchemas';
import { loginResponseSchema, userSchema } from '../types';

const LOGOUT_TIMEOUT_MS = 5_000;

export const authApi = {
  async login(values: LoginValues) {
    const { data } = await api.post(ENDPOINTS.auth.login, values, loginResponseSchema, { skipAuth: true });
    return data;
  },

  async me(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.users.me, userSchema, { signal });
    return data;
  },

  /** Revokes the server session. Best effort: local sign-out never waits on it for long. */
  async logout() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
    try {
      await api.post(ENDPOINTS.auth.logout, undefined, z.unknown(), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  /** Always answers 200 on the server, whether or not the email exists. */
  async requestPasswordReset(email: string) {
    await api.post(ENDPOINTS.auth.resetRequest, { email }, z.unknown(), { skipAuth: true });
  },

  async confirmPasswordReset(token: string, password: string) {
    await api.post(ENDPOINTS.auth.resetConfirm, { token, password }, z.unknown(), { skipAuth: true });
  },
};
