'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api/client';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Shared "create support ticket" mutation used by both the global
 * floating feedback button and any future support-page create form.
 * Keeps toast + list-invalidation behavior consistent across every
 * call site.
 */
export function useCreateTicketMutation({ onSuccess } = {}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const invalidateTickets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
  }, [queryClient]);

  return useMutation({
    mutationFn: (payload) => {
      const formData = new FormData();
      formData.append('type', payload.type);
      formData.append('subject', payload.subject);
      formData.append('description', payload.description);
      formData.append('priority', payload.priority);

      // Origin fields — flat multipart, not nested JSON
      if (payload.originPlatform) formData.append('originPlatform', payload.originPlatform);
      if (payload.originUrl) formData.append('originUrl', payload.originUrl);
      if (payload.originViewport) formData.append('originViewport', payload.originViewport);

      if (payload.file) formData.append('file', payload.file);

      return apiClient.post('/support', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      invalidateTickets();
      toast.success(t('support.toast.created', 'Ticket erfolgreich erstellt'));
      onSuccess?.();
    },
    onError: (err) => toast.error(err.message || t('support.toast.createFailed', 'Ticket konnte nicht erstellt werden')),
  });
}
