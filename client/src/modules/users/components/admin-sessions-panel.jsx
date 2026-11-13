'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/modules/users/services/user-service';
import { queryKeys } from '@/lib/query/keys';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { showSuccess, showError } from '@/lib/toast';
import { Monitor, Smartphone, Trash2, XCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { getUserDateLocale } from '../utils/user-display';
import { useState } from 'react';

export function AdminSessionsPanel({ userId }) {
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: sessions, isLoading } = useQuery({
    queryKey: queryKeys.users.sessions(userId),
    queryFn: () => userService.getUserSessions(userId),
    enabled: !!userId,
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => userService.revokeUserSessions(userId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.sessions(userId) });
      showSuccess(t('users.sessionsRevoked', '{count} sessions revoked', { count: res?.revokedCount ?? 0 }));
      setConfirmOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const sessionList = sessions?.data || sessions || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!sessionList.length) {
    return <EmptyState title={t('users.noSessions', 'No active sessions')} description={t('users.noSessionsDesc', 'This user has no active sessions.')} />;
  }

  return (
    <div className="space-y-4">
      {sessionList.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            {t('users.revokeAllSessions', 'Revoke all sessions')}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {sessionList.map((session) => (
          <div
            key={session.sessionId || session._id}
            className="flex items-center justify-between rounded-xl border p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              {session.deviceType === 'mobile' ? (
                <Smartphone className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Monitor className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {session.browser || t('common.unknown', 'Unknown')} — {session.os || t('common.unknown', 'Unknown')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.ipAddress} &middot; {t('users.lastActive', 'Last active')}:{' '}
                  {session.lastActiveAt
                    ? new Date(session.lastActiveAt).toLocaleString(getUserDateLocale(locale))
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('users.confirmRevokeSessions', 'Revoke all sessions?')}
        description={t('users.revokeSessionsDescription', 'All active sessions will end. The user will need to sign in again.')}
        onConfirm={() => revokeAllMutation.mutate()}
        loading={revokeAllMutation.isPending}
        confirmText={t('users.revokeAllSessions', 'Revoke all sessions')}
        variant="destructive"
      />
    </div>
  );
}
