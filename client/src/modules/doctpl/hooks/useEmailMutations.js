import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emailService } from '../services/EmailService';

export const useComposeEmail = () => useMutation({ mutationFn: emailService.compose });

export const useSendEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: emailService.send,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'emails'] }),
  });
};

export const useRetryEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: emailService.retry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'emails'] }),
  });
};
