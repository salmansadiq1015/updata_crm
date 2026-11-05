import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

const entrySchema = z.object({
  id: z.string(),
  at: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string().nullish(),
  summary: z.string().nullish(),
  body: z.string().nullish(),
  actor: z.object({ name: z.string().nullish() }).nullish(),
});

export function listLeadTimeline(leadId: string, cursor: string | undefined, signal?: AbortSignal) {
  return api.get(`${ENDPOINTS.leads.detail(leadId)}/timeline`, z.array(entrySchema), {
    signal,
    params: { cursor, limit: 10 },
  });
}
