import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { notificationPreferenceService } from '../services/notification-preference-service';

export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: () => notificationPreferenceService.getPreferences(),
    staleTime: 5 * 60 * 1000,
  });

  const updatePreferences = useMutation({
    mutationFn: (preferences) => notificationPreferenceService.updatePreferences(preferences),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.notifications.preferences(), updated);
    },
  });

  return {
    ...query,
    preferences: query.data,
    updatePreferences,
  };
}
