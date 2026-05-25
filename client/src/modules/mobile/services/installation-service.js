import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const installationService = {
  async createInstallation(siteId, data) {
    const res = await apiClient.post(ENDPOINTS.MOBILE.SITE_INSTALLATIONS(siteId), data);
    return normalizeInstallation(res.data?.data || res.data, siteId);
  },

  async updateInstallation(id, data) {
    const res = await apiClient.put(ENDPOINTS.MOBILE.INSTALLATION_BY_ID(id), data);
    return normalizeInstallation(res.data?.data || res.data);
  },

  async uploadNameplate(id, file, { caption = 'Nameplate' } = {}) {
    const formData = new FormData();
    formData.append('image', file, `nameplate-${id}.jpg`);
    formData.append('caption', caption);
    formData.append('category', 'nameplate');

    const res = await apiClient.post(ENDPOINTS.MOBILE.INSTALLATION_NAMEPLATE(id), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data || res.data;
  },

  async extractNameplate(file, installationId = null) {
    const formData = new FormData();
    formData.append('image', file, file.name || 'nameplate.jpg');

    const res = await apiClient.post(ENDPOINTS.MOBILE.INSTALLATION_NAMEPLATE_OCR(installationId), formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data || res.data;
  },

  async getInstallations(siteId) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.SITE_INSTALLATIONS(siteId));
    const items = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return items.map((item) => normalizeInstallation(item, siteId));
  },

  async getInstallationById(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.INSTALLATION_BY_ID(id));
    return normalizeInstallation(res.data?.data || res.data);
  },

  async getInstallationHistory(id) {
    const res = await apiClient.get(ENDPOINTS.MOBILE.INSTALLATION_HISTORY(id));
    return res.data;
  },
};

export function normalizeInstallation(item, fallbackSiteId = null) {
  if (!item) return null;

  return {
    id: item.id || item._id,
    site_id: item.site_id || item.siteId?._id || item.siteId || fallbackSiteId,
    customer_id: item.customer_id || null,
    installation_number: item.installation_number || item.installationNumber,
    system_type: item.system_type || item.type,
    manufacturer: item.manufacturer,
    model: item.model,
    name: item.name || item.model || item.installationNumber,
    serial_number: item.serial_number || item.serialNumber,
    commissioning_date: item.commissioning_date || item.commissioningDate,
    warranty_until: item.warranty_until || item.warrantyEndDate,
    power_output_kw: item.power_output_kw || item.powerOutputKw,
    capacity: item.capacity || (item.powerOutputKw ? `${item.powerOutputKw} kW` : null),
    fuel_type: item.fuel_type || item.fuelType,
    year_installed: item.year_installed || item.yearOfManufacture,
    technical_notes: item.technical_notes || item.technicalNotes,
    notes: item.notes || item.technicalNotes,
    status: item.status,
    updated_at: item.updated_at || item.updatedAt,
  };
}
