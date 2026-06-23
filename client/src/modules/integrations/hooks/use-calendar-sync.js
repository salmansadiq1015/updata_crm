import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { calendarSyncService } from '@/modules/integrations/services/calendar-sync-service';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';

export function useCalendarSyncStatus(options = {}) {
  return useQuery({
    queryKey: queryKeys.integrations.calendar.status(),
    queryFn: () => calendarSyncService.status(),
    select: (res) => res.data || {},
    staleTime: 60_000,
    ...options,
  });
}

export function useCalendarSyncMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({
    queryKey: queryKeys.integrations.calendar.status(),
  });

  const connect = useMutation({
    mutationFn: (provider) => calendarSyncService.connect(provider),
    onSuccess: (res) => {
      const authUrl = res?.data?.authUrl;
      if (authUrl && typeof window !== 'undefined') {
        window.location.assign(authUrl);
      }
    },
    onError: (err) => showError(err.message),
  });

  const disconnect = useMutation({
    mutationFn: (provider) => calendarSyncService.disconnect(provider),
    onSuccess: () => {
      invalidate();
      showSuccess('Kalender getrennt');
    },
    onError: (err) => showError(err.message),
  });

  return { connect, disconnect };
}
