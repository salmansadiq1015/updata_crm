'use client';

import { useQuery } from '@tanstack/react-query';
import { authService } from '@/modules/auth/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';

const eventLabelKeys = {
  'login.success': 'dashboard.activity.loginSuccess',
  'login.failed': 'dashboard.activity.loginFailed',
  logout: 'dashboard.activity.logout',
  'password.changed': 'dashboard.activity.passwordChanged',
  'user.created': 'dashboard.activity.userCreated',
  'user.updated': 'dashboard.activity.userUpdated',
  'user.deactivated': 'dashboard.activity.userDeactivated',
  'role.created': 'dashboard.activity.roleCreated',
  'role.updated': 'dashboard.activity.roleUpdated',
  'session.revoked': 'dashboard.activity.sessionRevoked',
  'account.activated': 'dashboard.activity.accountActivated',
};

function getEventLabel(entry, t) {
  const key = eventLabelKeys[entry?.eventType];
  return key ? t(key, entry.eventType) : entry?.eventType || '-';
}

export function RecentActivity() {
  const { t, locale } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ limit: 5, _recent: true }),
    queryFn: () => authService.getAuditLog({ limit: 5 }),
    staleTime: 30_000,
  });

  const entries = data?.data || [];
  const dateLocale = locale === 'en' ? 'en-GB' : `${locale}-CH`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          {t('dashboard.recentActivity')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('dashboard.activity.empty', 'No recent activity.')}
          </p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, i) => (
              <div
                key={entry._id || i}
                className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      entry.result === 'success' ? 'bg-success' : 'bg-destructive'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="text-sm">{getEventLabel(entry, t)}</span>
                    {entry.email && (
                      <span className="ml-2 text-xs text-muted-foreground">{entry.email}</span>
                    )}
                  </div>
                </div>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {entry.timestamp
                    ? new Date(entry.timestamp).toLocaleString(dateLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
