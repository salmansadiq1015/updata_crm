import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { downloadBlob } from '@/lib/api/download';

export const scheduleService = {
  async getSchedule(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.SCHEDULE(projectId));
    return res.data;
  },

  async getConflicts(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.SCHEDULE_CONFLICTS(projectId));
    return res.data;
  },

  async sendBulkConfirmations(projectId, items) {
    const res = await apiClient.post(ENDPOINTS.PM.CONFIRMATIONS_BULK(projectId), { items });
    return res.data;
  },

  async addEntry(projectId, data) {
    const res = await apiClient.post(ENDPOINTS.PM.SCHEDULE_ENTRIES(projectId), data);
    return res.data;
  },

  async updateEntry(projectId, entryId, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.SCHEDULE_ENTRY_BY_ID(projectId, entryId), data);
    return res.data;
  },

  async deleteEntry(projectId, entryId) {
    const res = await apiClient.delete(ENDPOINTS.PM.SCHEDULE_ENTRY_BY_ID(projectId, entryId));
    return res.data;
  },

  async sendConfirmation(projectId, entryId, data) {
    const res = await apiClient.post(ENDPOINTS.PM.CONFIRMATIONS(projectId, entryId), data);
    return res.data;
  },

  async updateConfirmationResponse(projectId, entryId, confId, data) {
    const res = await apiClient.patch(ENDPOINTS.PM.CONFIRMATION_BY_ID(projectId, entryId, confId), data);
    return res.data;
  },

  async getGeneratedDocumentDownloadUrl(documentId) {
    const res = await apiClient.get(ENDPOINTS.DOCTPL.DOCUMENT_DOWNLOAD(documentId));
    return res?.data?.downloadUrl || res?.downloadUrl || null;
  },

  async listProtocols(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.SCHEDULE_PROTOCOLS(projectId));
    return res.data;
  },

  async exportSchedule(projectId, format = 'ical', variant = 'internal') {
    if (format === 'ical') {
      const { data } = await apiClient.get(ENDPOINTS.PM.SCHEDULE_EXPORT(projectId), {
        params: { format: 'ical' },
        responseType: 'blob',
        transformResponse: [(x) => x],
      });
      const filename = `schedule-${projectId}.ics`;
      downloadBlob(data, filename, 'text/calendar;charset=utf-8');
      return { filename };
    }
    if (format === 'excel') {
      const { data } = await apiClient.get(ENDPOINTS.PM.SCHEDULE_EXPORT(projectId), {
        params: { format: 'excel' },
        responseType: 'blob',
        transformResponse: [(x) => x],
      });
      const filename = `Terminplan-${projectId}.xlsx`;
      downloadBlob(data, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return { filename };
    }
    // PDF is generated + stored server-side (for the document archive) and the
    // endpoint returns its metadata — unlike iCal/Excel which stream a blob. So
    // resolve the generated document's download URL and open it for the user.
    const res = await apiClient.get(ENDPOINTS.PM.SCHEDULE_EXPORT(projectId), {
      params: { format: 'pdf', variant },
    });
    const generatedDoc = res?.data || {};
    const documentId = generatedDoc.documentId || generatedDoc._id;
    if (documentId) {
      const url = await this.getGeneratedDocumentDownloadUrl(documentId);
      if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    }
    return { filename: generatedDoc.fileName };
  },

  // Materialize the Bauplan into deploy planning (target: 'einsatzplanung' |
  // 'grobplanung'); allocationPercent is an optional Grobplanung override.
  async transferSchedule(projectId, { target, allocationPercent } = {}) {
    const body = { target };
    if (allocationPercent) body.allocationPercent = allocationPercent;
    const res = await apiClient.post(ENDPOINTS.PM.SCHEDULE_TRANSFER(projectId), body);
    return res?.data?.data || res?.data;
  },
};
