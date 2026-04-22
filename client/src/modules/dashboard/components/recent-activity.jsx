'use client';

import { useQuery } from '@tanstack/react-query';
import { authService } from '@/modules/auth/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { Activity } from 'lucide-react';

const eventLabels = {
  'login.success': 'Anmeldung',
  'login.failed': 'Fehlgeschlagene Anmeldung',
  'logout': 'Abmeldung',
  'password.changed': 'Passwort geaendert',
  'user.created': 'Benutzer erstellt',
  'user.updated': 'Benutzer aktualisiert',
  'user.deactivated': 'Benutzer deaktiviert',
  'role.created': 'Rolle erstellt',
  'role.updated': 'Rolle aktualisiert',
  'session.revoked': 'Sitzung widerrufen',
  'account.activated': 'Konto aktiviert',
};

export function RecentActivity() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ limit: 5, _recent: true }),
    queryFn: () => authService.getAuditLog({ limit: 5 }),
    staleTime: 30_000,
  });

  const entries = data?.data || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
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
          <p className="text-sm text-muted-foreground py-4 text-center">Keine Aktivitaeten vorhanden.</p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, i) => (
              <div key={entry._id || i} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${entry.result === 'success' ? 'bg-success' : 'bg-destructive'}`} />
                  <div>
                    <span className="text-sm">{eventLabels[entry.eventType] || entry.eventType}</span>
                    {entry.email && (
                      <span className="text-xs text-muted-foreground ml-2">{entry.email}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {entry.timestamp
                    ? new Date(entry.timestamp).toLocaleString('de-CH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
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
