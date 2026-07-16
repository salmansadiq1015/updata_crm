'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleService } from '@/modules/roles/services/role-service';
import { userService } from '@/modules/users/services/user-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { RoleForm } from '@/modules/roles/components/role-form';
import { PermissionMatrix } from '@/modules/roles/components/permission-matrix';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { showSuccess, showError } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Pencil, Trash2, Shield, Users, Calendar, ChevronRight,
  Copy, Lock, Key, MoreHorizontal, Eye, Hash, Sparkles,
  CheckCircle2,
} from 'lucide-react';

const PROTECTED_ROLE_NAMES = ['Admin', 'User'];
const isProtectedRole = (role) =>
  !!role?.isSystem || PROTECTED_ROLE_NAMES.includes(role?.name);

const ROLE_ACCENTS = [
  { bg: 'bg-violet-500/10', ring: 'ring-violet-500/20', text: 'text-violet-500', bar: 'from-violet-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.25),transparent_60%)]' },
  { bg: 'bg-sky-500/10', ring: 'ring-sky-500/20', text: 'text-sky-500', bar: 'from-sky-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(14_165_233_/_0.25),transparent_60%)]' },
  { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', text: 'text-emerald-500', bar: 'from-emerald-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.25),transparent_60%)]' },
  { bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', text: 'text-amber-500', bar: 'from-amber-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(245_158_11_/_0.25),transparent_60%)]' },
  { bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', text: 'text-rose-500', bar: 'from-rose-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(244_63_94_/_0.25),transparent_60%)]' },
  { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20', text: 'text-indigo-500', bar: 'from-indigo-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(99_102_241_/_0.25),transparent_60%)]' },
  { bg: 'bg-pink-500/10', ring: 'ring-pink-500/20', text: 'text-pink-500', bar: 'from-pink-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(236_72_153_/_0.25),transparent_60%)]' },
  { bg: 'bg-teal-500/10', ring: 'ring-teal-500/20', text: 'text-teal-500', bar: 'from-teal-500 to-transparent', glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(20_184_166_/_0.25),transparent_60%)]' },
];

export default function RoleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canAdmin = hasPermission('roles:admin');

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
      showSuccess('Rolle gelöscht');
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

  if (isLoading) return <RoleDetailSkeleton />;

  if (!role) {
    return <EmptyState title="Rolle nicht gefunden" description="Die angeforderte Rolle existiert nicht." />;
  }

  const assignedUsers = usersData?.data || [];
  const permissions = role.permissions || [];
  const colorIdx = ((role.name || '').charCodeAt(0) || 0) % ROLE_ACCENTS.length;
  const accent = ROLE_ACCENTS[colorIdx];

  // Group permissions by module
  const permByModule = permissions.reduce((acc, p) => {
    const mod = typeof p === 'object' ? p.module : p.split(':')[0];
    if (!acc[mod]) acc[mod] = 0;
    acc[mod]++;
    return acc;
  }, {});
  const topModules = Object.entries(permByModule).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const handleFormSubmit = (data) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground transition-colors">Einstellungen</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/settings/roles" className="hover:text-foreground transition-colors">Rollen</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{role.name}</span>
      </nav>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Profile Card */}
          <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-theme-sm">
            <div className={cn('h-1 bg-linear-to-r', accent.bar)} />
            <div className={cn('pointer-events-none absolute inset-0 opacity-50', accent.glow)} />
            <div className="relative p-6 text-center">
              {/* Icon */}
              <div className="relative inline-flex mb-4">
                <div className={cn(
                  'h-20 w-20 rounded-2xl flex items-center justify-center ring-2 shadow-theme-sm',
                  accent.bg, accent.ring
                )}>
                  <Shield className={cn('h-10 w-10', accent.text)} />
                </div>
                {role.isSystem && (
                  <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border-[3px] border-card bg-amber-500 flex items-center justify-center">
                    <Lock className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
              </div>

              <h1 className="text-lg font-bold tracking-tight mb-1">{role.name}</h1>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2 min-h-[2rem]">
                {role.description || 'Keine Beschreibung'}
              </p>

              <div className="flex items-center justify-center">
                <span className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                  role.isSystem
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', role.isSystem ? 'bg-amber-500' : 'bg-emerald-500')} />
                  {role.isSystem ? 'Systemrolle' : 'Benutzerdefiniert'}
                </span>
              </div>

              <Separator className="my-4" />

              {/* Quick actions */}
              <div className="flex items-center justify-center gap-2">
                {canAdmin && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setFormOpen(true)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Bearbeiten</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-lg"
                        onClick={() => { navigator.clipboard.writeText(role._id); showSuccess('ID kopiert'); }}
                      >
                        <Hash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>ID kopieren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {canAdmin && !isProtectedRole(role) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 rounded-lg hover:border-destructive/40 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmOpen(true)}
                          disabled={assignedUsers.length > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Löschen</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2 shadow-theme-sm">
            <SidebarStatRow
              icon={Key}
              iconBg="bg-violet-500/10"
              iconColor="text-violet-500"
              label="Berechtigungen"
              value={permissions.length}
            />
            <SidebarStatRow
              icon={Users}
              iconBg="bg-sky-500/10"
              iconColor="text-sky-500"
              label="Zugewiesene Benutzer"
              value={assignedUsers.length}
            />
            <SidebarStatRow
              icon={Sparkles}
              iconBg="bg-indigo-500/10"
              iconColor="text-indigo-500"
              label="Module abgedeckt"
              value={Object.keys(permByModule).length}
            />
            <SidebarStatRow
              icon={Calendar}
              iconBg="bg-amber-500/10"
              iconColor="text-amber-500"
              label="Erstellt"
              value={role.createdAt ? new Date(role.createdAt).toLocaleDateString('de-CH') : '\u2014'}
            />
          </div>

          {/* Top modules */}
          {topModules.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-theme-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">
                Häufigste Module
              </p>
              <div className="space-y-2">
                {topModules.map(([mod, count], i) => {
                  const modAccent = ROLE_ACCENTS[i % ROLE_ACCENTS.length];
                  return (
                    <div key={mod} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn('h-5 w-5 rounded flex items-center justify-center shrink-0', modAccent.bg)}>
                          <CheckCircle2 className={cn('h-3 w-3', modAccent.text)} />
                        </div>
                        <span className="text-xs font-medium truncate capitalize">{mod}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="permissions" className="space-y-6">
            <TabsList variant="line">
              <TabsTrigger value="permissions" className="gap-1.5">
                <Key className="h-3.5 w-3.5" />
                Berechtigungen
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[10px] font-semibold">
                  {permissions.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Benutzer
                <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-semibold">
                  {assignedUsers.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="permissions">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        Berechtigungsmatrix
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Modul- und aktionsbasierte Zugriffsrechte
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                      {permissions.length} aktiv
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <PermissionMatrix permissions={permissions} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Zugewiesene Benutzer
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Alle Benutzer mit dieser Rolle
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {assignedUsers.length === 0 ? (
                    <EmptyState title="Keine Benutzer" description="Dieser Rolle sind keine Benutzer zugewiesen." />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {assignedUsers.map((u) => {
                        const userInitials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase();
                        const isActive = u.status === 'active' || u.isActive;
                        return (
                          <Link
                            key={u._id}
                            href={`/settings/users/${u._id}`}
                            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-border hover:bg-muted/30 hover:shadow-theme-sm transition-all group"
                          >
                            <div className="relative shrink-0">
                              <Avatar className="h-10 w-10 ring-2 ring-background shadow-theme-sm">
                                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                                  {userInitials}
                                </AvatarFallback>
                              </Avatar>
                              <div className={cn(
                                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card',
                                isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                              )} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                {u.firstName} {u.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                            <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <RoleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        defaultValues={role}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rolle löschen?"
        description={`Möchten Sie die Rolle "${role.name}" wirklich löschen?${
          assignedUsers.length > 0 ? ` ${assignedUsers.length} Benutzer sind dieser Rolle zugewiesen und müssen zuerst einer anderen Rolle zugewiesen werden.` : ''
        }`}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        confirmText="Löschen"
        variant="destructive"
      />
    </div>
  );
}

function SidebarStatRow({ icon: Icon, iconBg, iconColor, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors">
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

function RoleDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-2xl mb-4" />
            <Skeleton className="h-5 w-36 mb-2" />
            <Skeleton className="h-4 w-44 mb-4" />
            <Skeleton className="h-6 w-28 rounded-full mb-4" />
            <Separator className="w-full mb-4" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-24" /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
