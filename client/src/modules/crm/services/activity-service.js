import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { downloadBlob } from '@/lib/api/download';

/**
 * Unified site / installation activity-timeline service.
 *
 * The server exposes a single chronological feed merging notes, images,
 * maintenance, service orders, and QOP documents (quotation/order/invoice)
 * plus audit events. List endpoints return the full envelope (so callers can
 * read `.data` and `.pagination`); export triggers a browser file download.
 *
 * Response shape (after the axios envelope unwrap in client.js):
 *   { data: [ { _id, type, timestamp, title, summary, status, actor, link, meta } ],
 *     pagination: { hasNext, nextCursor, limit } }
 */
export const activityService = {
  async getSiteActivity(siteId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.SITE_ACTIVITY(siteId), { params });
    return res;
  },

  async getInstallationActivity(installationId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.CRM.INSTALLATION_ACTIVITY(installationId), { params });
    return res;
  },

  /**
   * Fetch one page of the timeline for either entity type.
   * Keeps the infinite-query hook entity-agnostic.
   */
  async getActivity(entityType, entityId, params = {}) {
    return entityType === 'site'
      ? this.getSiteActivity(entityId, params)
      : this.getInstallationActivity(entityId, params);
  },

  /**
   * Download the activity timeline as CSV or PDF. Triggers a browser file
   * download. Returns { filename } so the caller can surface a success toast.
   *
   * @param {Object} args
   * @param {'site'|'installation'} args.entityType
   * @param {string} args.entityId
   * @param {'csv'|'pdf'} [args.format]
   * @param {{ type?: string, dateFrom?: string, dateTo?: string }} [args.filters]
   */
  async exportActivity({ entityType, entityId, format = 'csv', filters = {} } = {}) {
    const url = entityType === 'site'
      ? ENDPOINTS.CRM.SITE_ACTIVITY_EXPORT(entityId)
      : ENDPOINTS.CRM.INSTALLATION_ACTIVITY_EXPORT(entityId);

    const params = { format };
    if (filters.type && filters.type !== 'all') params.type = filters.type;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;

    const { data } = await apiClient.get(url, {
      params,
      responseType: 'blob',
      transformResponse: [(x) => x],
    });

    const ext = format === 'pdf' ? 'pdf' : 'csv';
    const mime = format === 'pdf' ? 'application/pdf' : 'text/csv;charset=utf-8';
    const filename = `${entityType}-activity-${entityId}-${new Date().toISOString().split('T')[0]}.${ext}`;
    downloadBlob(data, filename, mime);
    return { filename };
  },
};
