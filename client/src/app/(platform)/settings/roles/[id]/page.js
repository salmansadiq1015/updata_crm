'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleService } from '@/services/role-service';
import { userService } from '@/services/user-service';
import { queryKeys } from '@/lib/query/keys';
import { PageHeader } from '@/components/common/page-header';
import { RoleForm } from '@/components/forms/role-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PermissionMatrix } from '@/components/common/permission-matrix';
import { PermissionGate } from '@/components/common/permission-gate';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { showSuccess, showError } from '@/lib/toast';
import {
  ArrowLeft, Pencil, Trash2, Shield, Users, Calendar,
  Copy, Lock, Key, MoreHorizontal, Eye,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function RoleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: role, isLoading } = useQuery({
    queryKey: queryKeys.roles.detail(id),
    queryFn: () => roleService.getRoleById(id),
    enabled: !!id,
  });

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ role: id }),
    queryFn: () => userService.getUsers({ role: id, pageSize: 100 }),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => roleService.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess('Rolle geloescht');
      router.push('/settings/roles');
    },
    onError: (err) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => roleService.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess('Rolle aktualisiert');
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
          <Skeleton className="h-96 rounded-xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!role) {
    return <EmptyState title="Rolle nicht gefunden" description="Die angeforderte Rolle existiert nicht." />;
  }

  const assignedUsers = usersData?.data || [];
  const permissions = role.permissions || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-lg" asChild>
            <Link href="/settings/roles">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight">{role.name}</h1>
                {role.isSystem && (
                  <Badge variant="secondary" className="gap-1 text-[0.65rem]">
                    <Lock className="h-2.5 w-2.5" />
                    Systemrolle
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{role.description || 'Keine Beschreibung'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PermissionGate permission="roles:admin">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => setFormOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Bearbeiten
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(role._id); showSuccess('ID kopiert'); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Rollen-ID kopieren
                </DropdownMenuItem>
                {!role.isSystem && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setConfirmOpen(true)}
                      disabled={assignedUsers.length > 0}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Rolle loeschen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGate>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/40">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{permissions.length}</p>
              <p className="text-xs text-muted-foreground">Berechtigungen</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">{assignedUsers.length}</p>
              <p className="text-xs text-muted-foreground">Zugewiesene Benutzer</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/40">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium">{role.createdAt ? new Date(role.createdAt).toLocaleDateString('de-CH') : '—'}</p>
              <p className="text-xs text-muted-foreground">Erstellt</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      <Tabs defaultValue="permissions" className="space-y-6">
        <TabsList>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Key className="h-3.5 w-3.5" />
            Berechtigungen
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Benutzer ({assignedUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Berechtigungsmatrix</CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {permissions.length} aktiv
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <PermissionMatrix permissions={permissions} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Zugewiesene Benutzer</CardTitle>
            </CardHeader>
            <CardContent>
              {assignedUsers.length === 0 ? (
                <EmptyState title="Keine Benutzer" description="Dieser Rolle sind keine Benutzer zugewiesen." />
              ) : (
                <div className="space-y-1">
                  {assignedUsers.map((u) => {
                    const userInitials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase();
                    return (
                      <Link
                        key={u._id}
                        href={`/settings/users/${u._id}`}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border">
                            <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                              {userInitials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium group-hover:text-primary transition-colors">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={u.status === 'active' || u.isActive ? 'default' : 'secondary'} className="text-[0.65rem]">
                            {u.status === 'active' || u.isActive ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                          <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RoleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(data) => updateMutation.mutateAsync(data)}
        defaultValues={role}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rolle loeschen?"
        description={`Moechten Sie die Rolle "${role.name}" wirklich loeschen?${
          assignedUsers.length > 0 ? ` ${assignedUsers.length} Benutzer sind dieser Rolle zugewiesen und muessen zuerst umgewiesen werden.` : ''
        }`}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        confirmText="Loeschen"
        variant="destructive"
      />
    </div>
  );
}
