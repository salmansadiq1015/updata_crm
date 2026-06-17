import { useQuery } from '@tanstack/react-query';
import { emailService } from '../services/EmailService';

function normalizeEmailList(response) {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export const useEmails = (params = {}, enabled = true) => useQuery({
  queryKey: ['doctpl', 'emails', params],
  queryFn: () => emailService.list(params),
  enabled,
  select: normalizeEmailList,
});
