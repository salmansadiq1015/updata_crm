import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const purchaseOrderService = {
  async list(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.PURCHASE_ORDERS, { params });
    return res;
  },
  async getById(id) {
    const res = await apiClient.get(ENDPOINTS.CRM.PURCHASE_ORDER_BY_ID(id));
    return res.data;
  },
  async create(data) {
    const res = await apiClient.post(ENDPOINTS.CRM.PURCHASE_ORDERS, data);
    return res.data;
  },
  async update(id, data) {
    const res = await apiClient.patch(ENDPOINTS.CRM.PURCHASE_ORDER_BY_ID(id), data);
    return res.data;
  },
  async cancel(id) {
    const res = await apiClient.post(ENDPOINTS.CRM.PURCHASE_ORDER_CANCEL(id));
    return res.data;
  },
  async receive(id, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.PURCHASE_ORDER_RECEIVE(id), data);
    return res.data;
  },

  // Inventory stats & movements
  async getStats() {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS_STATS);
    return res.data;
  },
  async getLowStock(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS_LOW_STOCK, { params });
    return res;
  },
  async getMovements(params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PARTS_MOVEMENTS, { params });
    return res;
  },
  async getMovementsByPart(id, params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SPARE_PART_MOVEMENTS(id), { params });
    return res;
  },
  async adjustStock(id, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.SPARE_PART_ADJUST_STOCK(id), data);
    return res.data;
  },

  // OCR / delivery note
  async uploadDeliveryNote(formData) {
    const res = await apiClient.post(ENDPOINTS.CRM.DELIVERY_NOTE_OCR, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async getOcrResult(jobId) {
    const res = await apiClient.get(ENDPOINTS.CRM.DELIVERY_NOTE_OCR_RESULT(jobId));
    return res.data;
  },
  async confirmOcr(jobId, data) {
    const res = await apiClient.post(ENDPOINTS.CRM.DELIVERY_NOTE_OCR_CONFIRM(jobId), data);
    return res.data;
  },
};
