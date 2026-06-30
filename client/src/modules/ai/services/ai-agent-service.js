import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export const aiAgentService = {
  dispatch:       (input, threadId, correlationId, context) => apiClient.post(ENDPOINTS.AI.AGENT_RUN, { input, threadId, correlationId, context }).then((r) => r.data),
  getStatus:      (runId)              => apiClient.get(ENDPOINTS.AI.AGENT_STATUS(runId)).then((r) => r.data),
  confirm:        (runId, decision)    => apiClient.post(ENDPOINTS.AI.AGENT_CONFIRM(runId), { decision }).then((r) => r.data),
  list:           (params)             => apiClient.get(ENDPOINTS.AI.AGENT_RUNS, { params }).then((r) => r.data),
  getThread:      (threadId)           => apiClient.get(ENDPOINTS.AI.AGENT_THREAD(threadId)).then((r) => r.data),
  archiveThread:  (threadId)           => apiClient.patch(ENDPOINTS.AI.AGENT_THREAD_ARCHIVE(threadId)).then((r) => r.data),
  deleteThread:   (threadId)           => apiClient.delete(ENDPOINTS.AI.AGENT_THREAD_DELETE(threadId)).then((r) => r.data),
};
