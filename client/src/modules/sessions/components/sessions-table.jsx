'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/modules/auth/services/auth-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { Monitor, Smartphone, Trash2, LogOut, Loader2 } from 'lucide-react';

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('de-CH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateString));
}

function DeviceIcon({ deviceType }) {
  if (deviceType === 'mobile' || deviceType === 'tablet') {
    return <Smartphone className="h-4 w-4 text-muted-foreground" />;
  }
  return <Monitor className="h-4 w-4 text-muted-foreground" />;
}

export function SessionsTable() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [showRevokeOthers, setShowRevokeOthers] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => authService.listSessions(),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId) => authService.revokeSession(sessionId),
    onSuccess: () => {
      showSuccess('Sitzung wurde beendet');
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      setRevokeTarget(null);
    },
    onError: (err) => showError(err.message),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => authService.revokeOtherSessions(),
    onSuccess: () => {
      showSuccess('Alle anderen Sitzungen wurden beendet');
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
      setShowRevokeOthers(false);
    },
    onError: (err) => showError(err.message),
  });

  const sessions = Array.isArray(data) ? data : (data?.sessions ?? data?.data ?? []);

  if (isLoading) {
    return (
      <Card className="border-border/40">
        <CardContent className="p-0">
          <div className="divide-y divide-border/30">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/30">
              {['Geraet / Browser', 'IP-Adresse', 'Letzte Aktivitaet', 'Erstellt', 'Aktionen'].map((h) => (
                <div key={h} className="h-4 w-24 rounded bg-muted animate-pulse" />
              ))}
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="flex items-center gap-2 flex-1">
                  <div className="h-5 w-5 rounded bg-muted animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-36 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  </div>
                </div>
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sitzungen konnten nicht geladen werden.
        </CardContent>
      </Card>
    );
  }

  const hasOtherSessions = sessions.some((s) => !s.isCurrent);

  return (
    <>
      <Card>
        {hasOtherSessions && (
          <div className="flex justify-end border-b px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevokeOthers(true)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Alle anderen abmelden
            </Button>
          </div>
        )}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gerät / Browser</TableHead>
                <TableHead>IP-Adresse</TableHead>
                <TableHead>Letzte Aktivität</TableHead>
                <TableHead>Erstellt</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Keine aktiven Sitzungen gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => {
                  const isCurrent = session.isCurrent;
                  return (
                    <TableRow key={session.sessionId || session.id} className={isCurrent ? 'bg-primary/5' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeviceIcon deviceType={session.deviceType} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {session.browser || session.userAgent || 'Unbekannt'}
                              </span>
                              {isCurrent && (
                                <Badge variant="secondary" className="text-xs">
                                  Aktuelle Sitzung
                                </Badge>
                              )}
                            </div>
                            {session.os && (
                              <span className="text-xs text-muted-foreground">{session.os}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {session.ipAddress || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(session.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(session.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isCurrent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(session)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Sitzung beenden"
        description="Möchten Sie diese Sitzung wirklich beenden? Das Gerät wird abgemeldet."
        confirmText="Abmelden"
        onConfirm={() => revokeMutation.mutate(revokeTarget?.sessionId || revokeTarget?.id)}
        loading={revokeMutation.isPending}
      />

      <ConfirmDialog
        open={showRevokeOthers}
        onOpenChange={setShowRevokeOthers}
        title="Alle anderen Sitzungen beenden"
        description="Möchten Sie alle anderen Sitzungen wirklich beenden? Alle anderen Geräte werden abgemeldet."
        confirmText="Alle abmelden"
        onConfirm={() => revokeOthersMutation.mutate()}
        loading={revokeOthersMutation.isPending}
      />
    </>
  );
}
