'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/modules/users/services/user-service';
import { roleService } from '@/modules/roles/services/role-service';
import { authService } from '@/modules/auth/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { UserForm } from '@/modules/users/components/user-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { AdminSessionsPanel } from '@/modules/users/components/admin-sessions-panel';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  Pencil, UserX, UserCheck, Mail, Phone,
  Globe, Calendar, Clock, Shield, Monitor, Activity,
  Copy, Briefcase, MapPin, ChevronRight,
  KeyRound, ExternalLink, Hash,
} from 'lucide-react';

const statusConfig = {
  active: { label: 'Aktiv', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400', ringColor: 'ring-emerald-500/30' },
  pending_activation: { label: 'Ausstehend', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400', ringColor: 'ring-amber-500/30' },
  deactivated: { label: 'Deaktiviert', dotColor: 'bg-muted-foreground/40', bgColor: 'bg-muted', textColor: 'text-muted-foreground', ringColor: 'ring-muted-foreground/20' },
  locked: { label: 'Gesperrt', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400', ringColor: 'ring-red-500/30' },
};

const langNames = { de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano' };

export default function UserDetailPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canWrite = hasPermission('users:write');
  const canAdmin = hasPermission('users:admin');
  const canAudit = hasPermission('audit:read');

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

  if (isLoading) return <DetailSkeleton />;

  if (!user) {
    return <EmptyState title="Benutzer nicht gefunden" description="Der angeforderte Benutzer existiert nicht." />;
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const isActive = user.status === 'active' || user.isActive;
  const status = statusConfig[user.status] || statusConfig.active;
  const fullAddress = [user.street, user.zip && user.city ? `${user.zip} ${user.city}` : user.city, user.country].filter(Boolean).join(', ');

  const handleFormSubmit = (data) => {
    updateMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/settings" className="hover:text-foreground transition-colors">Einstellungen</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/settings/users" className="hover:text-foreground transition-colors">{t('users.title')}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{user.firstName} {user.lastName}</span>
      </nav>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Profile Card */}
          <div className="rounded-xl border border-border/40 bg-card overflow-hidden ring-1 ring-foreground/10">
            <div className={cn('h-1', isActive ? 'bg-linear-to-r from-primary/60 to-primary/20' : 'bg-linear-to-r from-muted-foreground/20 to-transparent')} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <Avatar className={cn('h-20 w-20 border-4 border-background shadow-lg ring-2', status.ringColor)}>
                  <AvatarFallback className="text-xl font-bold bg-primary/8 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className={cn('absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full border-[3px] border-card', status.dotColor)} />
              </div>

              <h1 className="text-lg font-bold tracking-tight mb-1">{user.firstName} {user.lastName}</h1>
              <p className="text-sm text-muted-foreground mb-3">{user.email}</p>

              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', status.bgColor, status.textColor)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', status.dotColor)} />
                  {status.label}
                </span>
                {user.role?.name && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Shield className="h-3 w-3" />
                    {user.role.name}
                  </Badge>
                )}
              </div>

              {/* Active/Inactive Switch */}
              {canAdmin && (
                <div className="flex items-center justify-center gap-3 mb-4 py-3 px-4 rounded-lg bg-muted/30">
                  <span className="text-xs text-muted-foreground font-medium">Inaktiv</span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => setConfirmOpen(true)}
                    disabled={toggleActiveMutation.isPending}
                  />
                  <span className={cn('text-xs font-medium', isActive ? 'text-emerald-600' : 'text-muted-foreground')}>Aktiv</span>
                </div>
              )}

              <Separator className="my-4" />

              {/* Quick Actions */}
              <div className="flex items-center justify-center gap-2">
                {canWrite && (
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
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => { navigator.clipboard.writeText(user.email); showSuccess('E-Mail kopiert'); }}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>E-Mail kopieren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={() => { navigator.clipboard.writeText(user._id); showSuccess('ID kopiert'); }}>
                        <Hash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>User-ID kopieren</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="rounded-xl border border-border/40 bg-card ring-1 ring-foreground/10">
            <div className="p-4 space-y-1">
              <SidebarInfoItem icon={Mail} label={t('users.email')} value={user.email} copyable />
              <SidebarInfoItem icon={Phone} label={t('users.phone')} value={user.phone} />
              <SidebarInfoItem icon={Globe} label={t('users.language')} value={langNames[user.language] || user.language || 'Deutsch'} />
              <SidebarInfoItem icon={Briefcase} label={t('users.department') || 'Abteilung'} value={user.department} />
              <SidebarInfoItem icon={Briefcase} label={t('users.position') || 'Position'} value={user.position} />
              {fullAddress && <SidebarInfoItem icon={MapPin} label={t('users.address') || 'Adresse'} value={fullAddress} />}
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-border/40 bg-card ring-1 ring-foreground/10">
            <div className="p-4 space-y-1">
              <SidebarInfoItem icon={Calendar} label={t('users.created')} value={user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-CH') : null} />
              <SidebarInfoItem icon={Clock} label={t('users.lastLogin')} value={user.lastLoginAt || user.lastLogin ? new Date(user.lastLoginAt || user.lastLogin).toLocaleString('de-CH') : t('users.never')} />
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList variant="line">
              <TabsTrigger value="overview" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Übersicht
              </TabsTrigger>
              {canAdmin && (
                <TabsTrigger value="sessions" className="gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  Sitzungen
                </TabsTrigger>
              )}
              {canAudit && (
                <TabsTrigger value="activity" className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Aktivität
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2">
                <OverviewInfoCard icon={Shield} iconBg="bg-violet-500/10" iconColor="text-violet-500" label={t('users.role')} value={user.role?.name || '\u2014'} description={user.role?.description} />
                <OverviewInfoCard icon={Globe} iconBg="bg-sky-500/10" iconColor="text-sky-500" label={t('users.language')} value={langNames[user.language] || user.language || 'Deutsch'} />
                <OverviewInfoCard icon={Briefcase} iconBg="bg-amber-500/10" iconColor="text-amber-500" label={t('users.department') || 'Abteilung'} value={user.department || '\u2014'} description={user.position} />
                <OverviewInfoCard icon={KeyRound} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label="Authentifizierung" value={isActive ? 'Aktiv' : 'Inaktiv'} description={user.lastLoginAt ? `Letzte Anmeldung: ${new Date(user.lastLoginAt).toLocaleDateString('de-CH')}` : 'Noch nie angemeldet'} />
                {fullAddress && (
                  <OverviewInfoCard icon={MapPin} iconBg="bg-rose-500/10" iconColor="text-rose-500" label={t('users.address') || 'Adresse'} value={fullAddress} className="sm:col-span-2" />
                )}
              </div>
            </TabsContent>

            {canAdmin && (
              <TabsContent value="sessions">
                <Card className="border-border/40">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      Aktive Sitzungen
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AdminSessionsPanel userId={id} />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {canAudit && (
              <TabsContent value="activity">
                <Card className="border-border/40">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Letzte Aktivitäten
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AuditActivityTimeline userId={id} />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        defaultValues={user}
        roles={rolesData?.data || []}
        isLoading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isActive ? 'Benutzer deaktivieren?' : 'Benutzer aktivieren?'}
        description={`Möchten Sie ${user.firstName} ${user.lastName} wirklich ${isActive ? 'deaktivieren' : 'aktivieren'}?`}
        onConfirm={() => toggleActiveMutation.mutate()}
        loading={toggleActiveMutation.isPending}
        confirmText={isActive ? 'Deaktivieren' : 'Aktivieren'}
        variant={isActive ? 'destructive' : 'default'}
      />
    </div>
  );
}

function SidebarInfoItem({ icon: Icon, label, value, copyable }) {
  if (!value || value === '\u2014') {
    return (
      <div className="flex items-center gap-3 py-2.5 px-2 rounded-lg">
        <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
          <p className="text-sm text-muted-foreground/40">&mdash;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/30 transition-colors group">
      <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] text-muted-foreground/60 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
      {copyable && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => { navigator.clipboard.writeText(value); showSuccess('Kopiert'); }}
        >
          <Copy className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function OverviewInfoCard({ icon: Icon, iconBg, iconColor, label, value, description, className }) {
  return (
    <div className={cn('rounded-xl border border-border/40 bg-card ring-1 ring-foreground/10 hover:border-border/60 transition-all p-4 flex items-start gap-3.5', className)}>
      <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-4.5 w-4.5', iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
    </div>
  );
}

function AuditActivityTimeline({ userId }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ userId, limit: 20 }),
    queryFn: () => authService.getAuditLog({ userId, limit: 20 }),
    enabled: !!userId,
  });

  const entries = data?.data || [];

  const eventConfig = {
    'login.success': { label: 'Anmeldung erfolgreich', icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'login.failed': { label: 'Anmeldung fehlgeschlagen', icon: UserX, color: 'text-red-500', bg: 'bg-red-500/10' },
    'logout': { label: 'Abmeldung', icon: ExternalLink, color: 'text-muted-foreground', bg: 'bg-muted' },
    'password.changed': { label: 'Passwort geändert', icon: KeyRound, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'password.reset_requested': { label: 'Passwort-Reset angefordert', icon: KeyRound, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'user.updated': { label: 'Profil aktualisiert', icon: Pencil, color: 'text-primary', bg: 'bg-primary/10' },
    'user.created': { label: 'Konto erstellt', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'session.revoked': { label: 'Sitzung widerrufen', icon: Monitor, color: 'text-red-500', bg: 'bg-red-500/10' },
    'account.activated': { label: 'Konto aktiviert', icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'role.changed': { label: 'Rolle geändert', icon: Shield, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  };

  const defaultEvent = { label: '', icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted' };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!entries.length) return <EmptyState title="Keine Aktivitäten" description="Keine Aktivitäten für diesen Benutzer." />;

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-4 bottom-4 w-px bg-border/60" />
      <div className="space-y-1">
        {entries.map((entry, i) => {
          const config = eventConfig[entry.eventType] || { ...defaultEvent, label: entry.eventType };
          const EventIcon = config.icon;
          return (
            <div key={entry._id || i} className="relative flex gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/30 transition-colors">
              <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 z-10', config.bg)}>
                <EventIcon className={cn('h-3.5 w-3.5', config.color)} />
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{config.label}</p>
                  {entry.ipAddress && <p className="text-xs text-muted-foreground">IP: {entry.ipAddress}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString('de-CH') : '\u2014'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailSkeleton() {
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
          <div className="rounded-xl border border-border/40 bg-card p-6 flex flex-col items-center">
            <Skeleton className="h-20 w-20 rounded-full mb-4" />
            <Skeleton className="h-5 w-36 mb-2" />
            <Skeleton className="h-4 w-44 mb-3" />
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Separator className="my-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-32" /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card p-4 flex items-start gap-3.5">
                <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
