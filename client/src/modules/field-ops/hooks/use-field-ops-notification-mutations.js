'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/modules/mobile/services/notification-service';
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
    mutationFn: async () => {
      const data = queryClient.getQueryData(queryKeys.mobile.notifications.list()) || [];
      const unread = data.filter((n) => !n.is_read);
      for (const n of unread) {
        await notificationService.markRead(n._id || n.id);
      }
    },
    onSuccess: invalidate,
    onError: (err) => showError(err.message),
  });

  return { markRead, markAllRead };
}
