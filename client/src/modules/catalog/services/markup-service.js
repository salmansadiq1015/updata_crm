import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.CATALOG;

function emptyToNull(value) {
  return value === '' || value === undefined ? null : value;
}

function normalizeMarkupPayload(input = {}) {
  return {
    name: input.name,
    scope: input.scope || 'GLOBAL',
    priority: Number(input.priority ?? 100),
    manufacturerName: emptyToNull(input.manufacturerName),
    supplierId: emptyToNull(input.supplierId),
    categoryId: emptyToNull(input.categoryId),
    productGroup: emptyToNull(input.productGroup),
    articleId: emptyToNull(input.articleId),
    markupPercent: emptyToNull(input.markupPercent),
    marginPercent: emptyToNull(input.marginPercent),
    isActive: input.isActive ?? true,
    validFrom: emptyToNull(input.validFrom),
    validUntil: emptyToNull(input.validUntil),
  };
}

export const markupService = {
  list: (params = {}) => apiClient.get(E.MARKUPS, { params }),
  getById: (id) => apiClient.get(E.MARKUP_BY_ID(id)),
  create: (data) => apiClient.post(E.MARKUPS, normalizeMarkupPayload(data)),
  update: (id, data) => apiClient.put(E.MARKUP_BY_ID(id), normalizeMarkupPayload(data)),
  remove: (id) => apiClient.delete(E.MARKUP_BY_ID(id)),
  resolve: (data) => apiClient.post(E.MARKUP_RESOLVE, data),
};
