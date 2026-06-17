import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

function normalizeConnectionPayload(input = {}) {
  const credentials = Object.fromEntries(
    Object.entries(input.credentials || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  );
  const payload = {
    name: input.name,
    providerKey: input.providerKey,
    type: input.type || 'SUPPLIER',
    endpointUrl: input.endpointUrl || '',
    format: input.format || 'CSV',
    syncSchedule: input.syncSchedule || '@daily',
    isEnabled: input.isEnabled ?? true,
    isPreferred: input.isPreferred ?? false,
    preferredRank: Number(input.preferredRank ?? 100),
    supplierId: input.supplierId || null,
    supplierName: input.supplierName || '',
    manufacturerName: input.manufacturerName || '',
    defaultCategoryId: input.defaultCategoryId || null,
    defaultMarkupPercent: input.defaultMarkupPercent === '' ? null : input.defaultMarkupPercent,
    defaultMarginPercent: input.defaultMarginPercent === '' ? null : input.defaultMarginPercent,
    requestHeaders: input.requestHeaders || {},
  };
  if (Object.keys(credentials).length > 0) {
    payload.credentials = credentials;
  }
  return payload;
}

export const connectionService = {
  list: (params = {}) => apiClient.get(E.CONNECTIONS, { params }),
  getById: (id) => apiClient.get(E.CONNECTION_BY_ID(id)),
  create: (data) => apiClient.post(E.CONNECTIONS, normalizeConnectionPayload(data)),
  update: (id, data) => apiClient.put(E.CONNECTION_BY_ID(id), normalizeConnectionPayload(data)),
  remove: (id) => apiClient.delete(E.CONNECTION_BY_ID(id)),
  sync: (id, mode = 'MANUAL') => apiClient.post(E.CONNECTION_SYNC(id), { mode }),
  logs: (id, params = {}) => apiClient.get(E.CONNECTION_LOGS(id), { params }),
};
