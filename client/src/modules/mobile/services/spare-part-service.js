import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const sparePartService = {
  async search(term, limit = 20) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.SPARE_PART_SEARCH, {
      params: { q: term, limit },
    });
    const items = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return items.map(normalizeSparePart);
  },

  async getByInstallation(installationId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.INSTALLATION_SPARE_PARTS(installationId));
    const items = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return items.map(normalizeInstallationSparePart);
  },

  async linkToInstallation(installationId, payload) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.INSTALLATION_SPARE_PARTS(installationId), payload);
    return normalizeInstallationSparePart(res.data?.data || res.data);
  },

  async flagForOrdering(installationId, sparePartId, payload) {
    const res = await apiClient.post(
      ENDPOINTS.MOBILE.INSTALLATION_SPARE_PART_ORDER_FLAG(installationId, sparePartId),
      payload,
    );
    return normalizeInstallationSparePart(res.data?.data || res.data);
  },
};

export function normalizeSparePart(item = {}) {
  return {
    id: item.id || item._id,
    part_number: item.partNumber || item.part_number,
    name: item.name,
    manufacturer: item.manufacturer,
    category: item.category,
    unit_price: item.unitPrice ?? item.unit_price ?? null,
    currency: item.currency || 'CHF',
    unit: item.unit || 'pcs',
    current_stock: item.currentStock ?? item.current_stock ?? null,
    supplier_part_number: item.supplierPartNumber || item.supplier_part_number || null,
  };
}

export function normalizeInstallationSparePart(item = {}) {
  const part = normalizeSparePart(item.sparePartId || item.spare_part || item.sparePart || item);
  return {
    id: item.id || item._id || `${item.installationId || item.installation_id}:${part.id}`,
    installation_id: item.installationId || item.installation_id,
    spare_part_id: part.id,
    quantity: item.quantity ?? 1,
    notes: item.notes || null,
    needs_ordering: Boolean(item.needsOrdering ?? item.needs_ordering),
    order_quantity: item.orderQuantity ?? item.order_quantity ?? null,
    order_urgency: item.orderUrgency || item.order_urgency || null,
    order_notes: item.orderNotes || item.order_notes || null,
    order_status: item.orderStatus || item.order_status || null,
    spare_part: part,
  };
}
