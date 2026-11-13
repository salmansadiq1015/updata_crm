'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { userService } from '../services/user-service';
import { authService } from '@/modules/auth/services/auth-service';
import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '@/lib/query/keys';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { showSuccess, showError } from '@/lib/toast';

export function UserDeleteDialog({ ids, open, onOpenChange, onDeleted }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const deletion = useMutation({
    mutationFn: () => ids.length === 1 ? userService.deleteUser(ids[0]) : userService.bulkDelete(ids),
    onSuccess: async (result) => {
      onOpenChange(false);
      const currentId = useAuthStore.getState().user?._id || useAuthStore.getState().user?.id;
      if (ids.includes(currentId)) {
        await authService.logout();
        queryClient.clear();
        router.replace('/login');
        return;
      }
      ids.forEach((id) => queryClient.removeQueries({ queryKey: queryKeys.users.detail(id) }));
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess(t('users.toastDeleted', '{count} users deleted', { count: result?.deletedCount ?? ids.length }));
      onDeleted?.();
    },
    onError: (error) => showError(error.message),
  });

  return <ConfirmDialog
    open={open}
    onOpenChange={(value) => { if (!deletion.isPending) onOpenChange(value); }}
    title={t('users.confirmDeleteTitle', 'Delete {count} users?', { count: ids.length })}
    description={t('users.confirmDeleteDescription', 'The selected accounts will be removed from the user directory and signed out. Historical project and audit records are retained.')}
    onConfirm={() => { if (ids.length && !deletion.isPending) deletion.mutate(); }}
    loading={deletion.isPending}
    confirmText={t('users.delete', 'Delete')}
  />;
}
