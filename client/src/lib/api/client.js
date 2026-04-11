import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9097/api/v1';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Token refresh state (prevent concurrent refreshes)
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

// Request interceptor — inject auth token
apiClient.interceptors.request.use(
  (config) => {
    // Import dynamically to avoid circular deps
    const { useAuthStore } = require('@/stores/auth-store');
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Request-Id'] = crypto.randomUUID();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — unwrap envelope + handle 401 refresh
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
    // Unwrap the { success, data, meta, pagination } envelope
    if (body && typeof body === 'object' && 'success' in body) {
      return {
        data: body.data,
        meta: body.meta || {},
        pagination: body.pagination || null,
        _raw: body,
      };
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 — try token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const Cookies = (await import('js-cookie')).default;
        const refreshToken = Cookies.get('mb_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data || res.data;

        const { useAuthStore } = await import('@/stores/auth-store');
        useAuthStore.getState().setTokens(accessToken);
        Cookies.set('mb_refresh_token', newRefreshToken, { path: '/', sameSite: 'strict' });

        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        const { useAuthStore } = await import('@/stores/auth-store');
        useAuthStore.getState().clearAuth();
        const Cookies = (await import('js-cookie')).default;
        Cookies.remove('mb_refresh_token');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Normalize error shape
    const normalized = {
      statusCode: error.response?.status || 500,
      message: error.response?.data?.error?.message || error.response?.data?.message || error.message || 'An error occurred',
      details: error.response?.data?.error?.details || [],
      requestId: error.response?.data?.meta?.requestId || null,
    };
    return Promise.reject(normalized);
  }
);

export default apiClient;
