import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const EMPTY_SUMMARY = Object.freeze({
  total: 0,
  private: 0,
  business: 0,
  billing: 0,
  site: 0,
  delivery: 0,
  withCoordinates: 0,
});

const EMPTY_PAGINATION = Object.freeze({
  page: 1,
  limit: 50,
  total: 0,
  pageCount: 1,
  hasNext: false,
  hasPrev: false,
});

export const addressBookService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.ADDRESS_BOOK, { params });
    return {
      data: Array.isArray(res.data?.data) ? res.data.data : [],
      summary: res.data?.summary || EMPTY_SUMMARY,
      pagination: res.data?.pagination || EMPTY_PAGINATION,
      filters: res.data?.filters || params,
    };
  },
};
