'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatService } from '@/modules/mobile/services/chat-service';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';

export function useFieldOpsChatMutations(projectId) {
  const queryClient = useQueryClient();

  const sendMessage = useMutation({
    mutationFn: (data) => chatService.sendMessage(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.chat.byProject(projectId) });
    },
    onError: (err) => showError(err.message),
  });

  return { sendMessage };
}
