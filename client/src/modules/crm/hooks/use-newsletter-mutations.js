'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { newsletterService } from '@/modules/crm/services/newsletter-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Bundles all newsletter write paths into a single hook so components stay lean.
 * Each mutation does its own toast + cache invalidation; pages pass callbacks
 * (`onSuccess`) only when they need to close a dialog or reset selection.
 */
export function useNewsletterMutations({
  onCreate,
  onUpdate,
  onDelete,
  onSchedule,
  onCancel,
  onSend,
  onRevert,
} = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.crm.newsletters.all() });
  };

  const create = useMutation({
    mutationFn: (data) => newsletterService.createNewsletter(data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterCreated', 'Newsletter created'));
      onCreate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => newsletterService.updateNewsletter(id, data),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterUpdated', 'Newsletter updated'));
      onUpdate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id) => newsletterService.deleteNewsletter(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterDeleted', 'Newsletter deleted'));
      onDelete?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const schedule = useMutation({
    mutationFn: ({ id, scheduledAt }) => newsletterService.scheduleNewsletter(id, scheduledAt),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterScheduled', 'Newsletter scheduled'));
      onSchedule?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const cancel = useMutation({
    mutationFn: (id) => newsletterService.cancelNewsletter(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterCancelled', 'Newsletter cancelled'));
      onCancel?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const send = useMutation({
    mutationFn: (id) => newsletterService.sendNewsletter(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterSending', 'Newsletter sending initiated'));
      onSend?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const revert = useMutation({
    mutationFn: (id) => newsletterService.revertToDraft(id),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('crm.newsletterReverted', 'Newsletter reverted to draft'));
      onRevert?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { create, update, remove, schedule, cancel, send, revert };
}
