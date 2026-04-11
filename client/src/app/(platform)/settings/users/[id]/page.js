'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/user-service';
import { roleService } from '@/services/role-service';
import { authService } from '@/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { PageHeader } from '@/components/common/page-header';
import { UserForm } from '@/components/forms/user-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { AdminSessionsPanel } from '@/components/common/admin-sessions-panel';
import { PermissionGate } from '@/components/common/permission-gate';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { showSuccess, showError } from '@/lib/toast';
import {
  ArrowLeft, Pencil, UserX, UserCheck, Mail, Phone,
  Globe, Calendar, Clock, Shield, Key, Monitor, Activity,
  Copy, MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusConfig = {
  active: { label: 'Aktiv', variant: 'default', color: 'bg-success' },
  pending_activation: { label: 'Ausstehend', variant: 'secondary', color: 'bg-warning' },
  deactivated: { label: 'Deaktiviert', variant: 'outline', color: 'bg-muted-foreground/40' },
  locked: { label: 'Gesperrt', variant: 'destructive', color: 'bg-destructive' },
};

const langNames = { de: 'Deutsch', en: 'English', fr: 'Francais', it: 'Italiano' };

export default function UserDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => userService.getUserById(id),
    enabled: !!id,
  });

  const { data: rolesData } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => userService.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      showSuccess('Benutzer aktualisiert');
    },
    onError: (err) => showError(err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      user?.status === 'active' || user?.isActive
        ? userService.deactivateUser(id)
        : userService.activateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      showSuccess(isActive ? 'Benutzer deaktiviert' : 'Benutzer aktiviert');
      setConfirmOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <EmptyState title="Benutzer nicht gefunden" description="Der angeforderte Benutzer existiert nicht." />;
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const isActive = user.status === 'active' || user.isActive;
  const status = statusConfig[user.status] || statusConfig.active;

  const infoItems = [
    { icon: Mail, label: 'E-Mail', value: user.email },
    { icon: Phone, label: 'Telefon', value: user.phone || '—' },
    { icon: Shield, label: 'Rolle', value: user.role?.name || '—', badge: true },
    { icon: Globe, label: 'Sprache', value: langNames[user.language] || user.language || 'Deutsch' },
    { icon: Calendar, label: 'Erstellt', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-CH') : '—' },
    { icon: Clock, label: 'Letzter Login', value: user.lastLoginAt || user.lastLogin ? new Date(user.lastLoginAt || user.lastLogin).toLocaleString('de-CH') : 'Nie' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-lg" asChild>
            <Link href="/settings/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-14 w-14 border-2 border-border">
                <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-card ${status.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight">{user.firstName} {user.lastName}</h1>
                <Badge variant={status.variant} className="text-[0.65rem]">{status.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <PermissionGate permission="users:write">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => setFormOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Bearbeiten
            </Button>
          </PermissionGate>
          <PermissionGate permission="users:admin">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(user._id); showSuccess('ID kopiert'); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  User ID kopieren
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(user.email); showSuccess('E-Mail kopiert'); }}>
                  <Mail className="mr-2 h-3.5 w-3.5" />
                  E-Mail kopieren
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfirmOpen(true)}
                  className={isActive ? 'text-destructive focus:text-destructive' : 'text-success focus:text-success'}
                >
                  {isActive ? <UserX className="mr-2 h-3.5 w-3.5" /> : <UserCheck className="mr-2 h-3.5 w-3.5" />}
                  {isActive ? 'Deaktivieren' : 'Aktivieren'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGate>
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Uebersicht
          </TabsTrigger>
          <PermissionGate permission="users:admin">
            <TabsTrigger value="sessions" className="gap-1.5">
              <Monitor className="h-3.5 w-3.5" />
              Sitzungen
            </TabsTrigger>
          </PermissionGate>
          <PermissionGate permission="audit:read">
            <TabsTrigger value="activity" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Aktivitaet
            </TabsTrigger>
          </PermissionGate>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Benutzerinformationen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {infoItems.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
                      {item.badge ? (
                        <Badge variant="outline" className="font-medium">{item.value}</Badge>
                      ) : (
                        <p className="text-sm font-medium truncate">{item.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Aktive Sitzungen</CardTitle>
            </CardHeader>
            <CardContent>
              <AdminSessionsPanel userId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Letzte Aktivitaeten</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditActivityList userId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(data) => updateMutation.mutateAsync(data)}
        defaultValues={user}
        roles={rolesData?.data || []}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isActive ? 'Benutzer deaktivieren?' : 'Benutzer aktivieren?'}
        description={`Moechten Sie ${user.firstName} ${user.lastName} wirklich ${isActive ? 'deaktivieren' : 'aktivieren'}?`}
        onConfirm={() => toggleActiveMutation.mutate()}
        loading={toggleActiveMutation.isPending}
        confirmText={isActive ? 'Deaktivieren' : 'Aktivieren'}
        variant={isActive ? 'destructive' : 'default'}
      />
    </div>
  );
}

function AuditActivityList({ userId }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ userId, limit: 20 }),
    queryFn: () => authService.getAuditLog({ userId, limit: 20 }),
    enabled: !!userId,
  });

  const entries = data?.data || [];

  const eventLabels = {
    'login.success': 'Anmeldung erfolgreich',
    'login.failed': 'Anmeldung fehlgeschlagen',
    'logout': 'Abmeldung',
    'password.changed': 'Passwort geaendert',
    'password.reset_requested': 'Passwort-Reset angefordert',
    'user.updated': 'Profil aktualisiert',
    'user.created': 'Konto erstellt',
    'session.revoked': 'Sitzung widerrufen',
    'account.activated': 'Konto aktiviert',
    'role.changed': 'Rolle geaendert',
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 flex-1 max-w-[200px]" />
            <Skeleton className="h-3 w-24 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return <EmptyState title="Keine Aktivitaeten" description="Keine Aktivitaeten fuer diesen Benutzer." />;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <div key={entry._id || i} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${entry.result === 'success' ? 'bg-success' : 'bg-destructive'}`} />
            <div>
              <span className="text-sm font-medium">{eventLabels[entry.eventType] || entry.eventType}</span>
              {entry.ipAddress && (
                <span className="text-xs text-muted-foreground ml-2">({entry.ipAddress})</span>
              )}
            </div>
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {entry.timestamp ? new Date(entry.timestamp).toLocaleString('de-CH') : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
