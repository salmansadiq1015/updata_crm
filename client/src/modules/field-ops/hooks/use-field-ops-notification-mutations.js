'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/modules/mobile/services/notification-service';
import { useNotificationStore } from '@/stores/notification-store';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';

export function useFieldOpsNotificationMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.notifications.list() });
  };

  const markRead = useMutation({
    mutationFn: (id) => notificationService.markRead(id),
    onSuccess: invalidate,
    onError: (err) => showError(err.message),
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      invalidate();
      useNotificationStore.getState().markAllAsRead();
    },
    onError: (err) => showError(err.message),
  });

  return { markRead, markAllRead };
}
