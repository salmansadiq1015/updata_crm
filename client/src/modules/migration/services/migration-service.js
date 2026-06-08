import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const E = ENDPOINTS.MIGRATION;

export const migrationService = {
  listRuns: (params = {}) => apiClient.get(E.RUNS, { params }),
  createRun: (data) => apiClient.post(E.RUNS, data),
  getRun: (id) => apiClient.get(E.RUN_BY_ID(id)),
  addSourceRecords: (id, data) => apiClient.post(E.RUN_SOURCE_RECORDS(id), data),
  start: (id) => apiClient.post(E.RUN_START(id)),
  pause: (id) => apiClient.post(E.RUN_PAUSE(id)),
  resume: (id) => apiClient.post(E.RUN_RESUME(id)),
  cancel: (id) => apiClient.post(E.RUN_CANCEL(id)),
  rollback: (id, data) => apiClient.post(E.RUN_ROLLBACK(id), data),
  progress: (id) => apiClient.get(E.RUN_PROGRESS(id)),
  errors: (id, params = {}) => apiClient.get(E.RUN_ERRORS(id), { params }),
  exportErrors: (id, params = {}) => apiClient.get(E.RUN_ERRORS_EXPORT(id), {
    params,
    responseType: 'blob',
  }),
  validationReport: (id) => apiClient.get(E.RUN_VALIDATION_REPORT(id)),
  generateSpotCheck: (id, data) => apiClient.post(E.RUN_SPOT_CHECK(id), data),
};
