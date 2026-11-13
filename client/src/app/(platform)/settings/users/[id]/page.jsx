'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/modules/users/services/user-service';
import { roleService } from '@/modules/roles/services/role-service';
import { authService } from '@/modules/auth/services/auth-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { UserDeleteDialog } from '@/modules/users/components/user-delete-dialog';
import { getUserDateLocale, getUserRoleLabel, getUserDepartmentLabel, getUserPositionLabel } from '@/modules/users/utils/user-display';
import { findAssignmentTargetName } from '@/modules/users/utils/project-assignment';
import { UserForm } from '@/modules/users/components/user-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { AdminSessionsPanel } from '@/modules/users/components/admin-sessions-panel';
import { UserProjectsPanel } from '@/modules/users/components/user-projects-panel';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useBreadcrumbLabel } from '@/stores/breadcrumb-store';
import {
  Pencil, UserX, UserCheck, Mail, Phone, Trash2,
  Globe, Calendar, Clock, Shield, Monitor, Activity,
  Copy, Briefcase, MapPin, 
  KeyRound, ExternalLink, Hash, Wrench, Award,
} from 'lucide-react';

// Account state — one clear label per status plus a plain-language description
// of what it means (the badge and the "Kontostatus" card both read from here).
const statusConfig = {
  active: { key: 'users.active', fallback: 'Aktiv', descKey: 'users.statusActiveDesc', descFallback: 'Konto aktiv – Anmeldung möglich', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400', ringColor: 'ring-emerald-500/30' },
  pending_activation: { key: 'users.pending', fallback: 'Nicht aktiviert', descKey: 'users.statusPendingDesc', descFallback: 'Einladung gesendet – Konto noch nicht aktiviert', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400', ringColor: 'ring-amber-500/30' },
  deactivated: { key: 'users.deactivated', fallback: 'Deaktiviert', descKey: 'users.statusDeactivatedDesc', descFallback: 'Zugriff deaktiviert – keine Anmeldung möglich', dotColor: 'bg-muted-foreground/40', bgColor: 'bg-muted', textColor: 'text-muted-foreground', ringColor: 'ring-muted-foreground/20' },
  locked: { key: 'users.locked', fallback: 'Gesperrt', descKey: 'users.statusLockedDesc', descFallback: 'Konto gesperrt – vorübergehend blockiert', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400', ringColor: 'ring-red-500/30' },
};

const langNames = { de: 'German', en: 'English', fr: 'French', it: 'Italian' };

export default function UserDetailPage() {
  const { t, locale } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const dateLocale = getUserDateLocale(locale);

  const canWrite = hasPermission('users:write');
  const canAdmin = hasPermission('users:admin');
  const canAudit = hasPermission('audit:read');

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => userService.getUserById(id),
    enabled: !!id,
  });

  const { data: rolesData } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const { data: assignmentTargets = [] } = useQuery({
    queryKey: queryKeys.users.assignmentTargets(),
    queryFn: () => userService.getAssignmentTargets(),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => userService.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess(t('users.toastUpdated'));
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
      showSuccess(t(isActive ? 'users.toastDeactivated' : 'users.toastActivated'));
      setConfirmOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const resendInvitation = useMutation({
    mutationFn: () => userService.resendInvitation(id),
    onSuccess: () => showSuccess(t('users.invitationSent', 'Invitation sent')),
    onError: (error) => showError(error.message),
  });
  const resetPassword = useMutation({
    mutationFn: () => authService.requestPasswordReset(user.email),
    onSuccess: () => { setResetOpen(false); showSuccess(t('users.resetSent', 'Password reset email requested')); },
    onError: (error) => showError(error.message),
  });

  useBreadcrumbLabel(id, user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '');

  if (isLoading) return <DetailSkeleton />;

  if (isError) return <div role="alert" className="space-y-3">
    <p>{t('users.loadError', 'Unable to load user data.')}</p>
    <Button onClick={() => refetch()}>{t('common.retry', "Retry")}</Button>
  </div>;

  if (!user) {
    return <EmptyState title={t('users.notFound', "User not found")} description={t('users.notFoundDesc', "The requested user does not exist.")} />;
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const isActive = user.status === 'active' || user.isActive;
  const status = statusConfig[user.status] || statusConfig.active;
  // Swiss postal order: supplement (c/o, Postfach) sits above the street — same as CRM customers.
  const fullAddress = [user.addressSupplement, user.street, [user.zip, user.city].filter(Boolean).join(' '), user.country].filter(Boolean).join(', ');

  const handleFormSubmit = (data) => {
    return updateMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6">

      {/* Main Layout */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(260px,300px)_minmax(0,1fr)]">
        {/* Left Sidebar */}
        <div className="min-w-0 space-y-4">
          {/* Profile Card */}
          <div className="rounded-xl border border-border/40 bg-card overflow-hidden ring-1 ring-foreground/10">
            <div className={cn('h-1', isActive ? 'bg-linear-to-r from-primary/60 to-primary/20' : 'bg-linear-to-r from-muted-foreground/20 to-transparent')} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <Avatar className={cn('h-20 w-20 border-4 border-background shadow-lg ring-2', status.ringColor)}>
                  {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={`${user.firstName} ${user.lastName}`} />}
                  <AvatarFallback className="text-xl font-bold bg-primary/8 text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className={cn('absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full border-[3px] border-card', status.dotColor)} />
              </div>

              <h1 className="text-lg font-bold tracking-tight mb-1">{[(user.salutation ? t(user.salutation === 'herr' ? 'users.salutationHerr' : 'users.salutationFrau') : ''), user.firstName, user.lastName].filter(Boolean).join(' ')}</h1>
              <p className="text-sm text-muted-foreground mb-3">{user.email}</p>

              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', status.bgColor, status.textColor)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', status.dotColor)} />
                  {t(status.key, status.fallback)}
                </span>
                {user.role?.name && (
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Shield className="h-3 w-3" />
                    {getUserRoleLabel(user.role.name, t)}
                  </Badge>
                )}
              </div>

              {/* Active/Inactive Switch */}
              {canAdmin && (
                <div className="flex items-center justify-center gap-3 mb-4 py-3 px-4 rounded-lg bg-muted/30">
                  <span className="text-xs text-muted-foreground font-medium">{t('users.inactive', "Inactive")}</span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => setConfirmOpen(true)}
                    disabled={toggleActiveMutation.isPending}
                    aria-label={t(isActive ? 'users.deactivate' : 'users.activate')}
                  />
                  <span className={cn('text-xs font-medium', isActive ? 'text-emerald-600' : 'text-muted-foreground')}>{t('users.active')}</span>
                </div>
              )}

              <Separator className="my-4" />

              {canAdmin && <div className="flex flex-col gap-2 mb-4">
                <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="gap-2">
                  <Trash2 className="h-4 w-4" />{t('users.delete', 'Delete')}
                </Button>
                {user.invitationPending && <Button variant="outline" disabled={resendInvitation.isPending || !['active', 'pending_activation'].includes(user.status)} onClick={() => resendInvitation.mutate()}>
                  {t('users.resendInvitation', 'Resend invitation')}
                </Button>}
                <Button variant="outline" disabled={user.status !== 'active'} onClick={() => setResetOpen(true)}>
                  {t('users.sendPasswordReset', 'Send password reset')}
                </Button>
              </div>}
              {/* Quick Actions */}
              <div className="flex items-center justify-center gap-2">
                {canWrite && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label={t('common.edit', 'Edit')} onClick={() => setFormOpen(true)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.edit', "Edit")}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label={t('users.copyEmail', 'Copy email')} onClick={() => { navigator.clipboard.writeText(user.email); showSuccess(t('users.toastEmailCopied')); }}>
                        <Mail className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('users.copyEmail', "Copy email")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label={t('users.copyId', 'Copy user ID')} onClick={() => { navigator.clipboard.writeText(user._id); showSuccess(t('users.idCopied', 'User ID copied')); }}>
                        <Hash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('users.copyId', "Copy User ID")}</TooltipContent>
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
              <SidebarInfoItem icon={Globe} label={t('users.language')} value={t(`users.languageNames.${user.language || 'de'}`, langNames[user.language] || user.language || 'German')} />
              <SidebarInfoItem icon={Briefcase} label={t('users.department', "Department")} value={getUserDepartmentLabel(user.department, t)} />
              <SidebarInfoItem icon={Briefcase} label={t('users.position', "Position")} value={getUserPositionLabel(user.department, user.position, t)} />
              {fullAddress && <SidebarInfoItem icon={MapPin} label={t('users.address', "Address")} value={fullAddress} />}
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-xl border border-border/40 bg-card ring-1 ring-foreground/10">
            <div className="p-4 space-y-1">
              <SidebarInfoItem icon={Hash} label={t('users.initials', "Initials")} value={user.initials} />
              <SidebarInfoItem icon={Calendar} label={t('users.birthDate', "Date of birth")} value={user.birthDate ? new Date(user.birthDate).toLocaleDateString(dateLocale) : null} />
              <SidebarInfoItem icon={Briefcase} label={t('users.assignmentTarget', 'Assignment department')} value={findAssignmentTargetName(assignmentTargets, user.preferences?.preferredDepartmentId)} />
              <SidebarInfoItem icon={Calendar} label={t('users.created')} value={user.createdAt ? new Date(user.createdAt).toLocaleDateString(dateLocale) : null} />
              <SidebarInfoItem icon={Clock} label={t('users.lastLogin')} value={user.lastLoginAt || user.lastLogin ? new Date(user.lastLoginAt || user.lastLogin).toLocaleString(dateLocale) : t('users.never')} />
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger value="overview" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                {t('users.tabs.overview', 'Overview')}
              </TabsTrigger>
              <TabsTrigger value="projects" className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                {t('users.projects.title', "Projects")}
              </TabsTrigger>
              {canAdmin && (
                <TabsTrigger value="sessions" className="gap-1.5">
                  <Monitor className="h-3.5 w-3.5" />
                  {t('users.tabs.sessions', 'Sessions')}
                </TabsTrigger>
              )}
              {canAudit && (
                <TabsTrigger value="activity" className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {t('users.tabs.activity', 'Activity')}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2">
                <OverviewInfoCard icon={Shield} iconBg="bg-brand-500/10" iconColor="text-brand-500" label={t('users.role')} value={getUserRoleLabel(user.role?.name, t) || '\u2014'} description={user.role?.description} />
                <OverviewInfoCard icon={Globe} iconBg="bg-sky-500/10" iconColor="text-sky-500" label={t('users.language')} value={t(`users.languageNames.${user.language || 'de'}`, langNames[user.language] || user.language || 'German')} />
                <OverviewInfoCard icon={Briefcase} iconBg="bg-amber-500/10" iconColor="text-amber-500" label={t('users.department', "Department")} value={getUserDepartmentLabel(user.department, t) || '\u2014'} description={getUserPositionLabel(user.department, user.position, t)} />
                <OverviewInfoCard icon={KeyRound} iconBg={status.bgColor} iconColor={status.textColor} label={t('users.accountStatus', "Account status")} value={t(status.key, status.fallback)} description={t(status.descKey, status.descFallback)} />
                {fullAddress && (
                  <OverviewInfoCard icon={MapPin} iconBg="bg-rose-500/10" iconColor="text-rose-500" label={t('users.address', "Address")} value={fullAddress} className="sm:col-span-2" />
                )}
                {(user.schedulingSkills?.length > 0 || user.schedulingCertifications?.length > 0) && (
                  <div className="rounded-xl border border-border/40 bg-card p-4 sm:col-span-2 ring-1 ring-foreground/5 space-y-3">
                    {user.schedulingSkills?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Wrench className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('users.skills', "Skills / Qualifications")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {user.schedulingSkills.map((s) => (
                            <span key={s} className="inline-flex items-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-medium">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {user.schedulingCertifications?.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="h-3.5 w-3.5 text-sky-500" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('users.certifications', "Certificates / Competences")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {user.schedulingCertifications.map((c) => (
                            <span key={c} className="inline-flex items-center rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2.5 py-0.5 text-xs font-medium">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="projects">
              <UserProjectsPanel
                userId={id}
                user={user}
                canWrite={canWrite}
                assignmentTargets={assignmentTargets}
              />
            </TabsContent>

            {canAdmin && (
              <TabsContent value="sessions">
                <Card className="border-border/40">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                      {t('users.activeSessions', 'Active sessions')}
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
                      {t('users.recentActivity', "Recent Activity")}
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
      <UserDeleteDialog ids={[id]} open={deleteOpen} onOpenChange={setDeleteOpen}
        onDeleted={() => router.push('/settings/users')} />
      <ConfirmDialog open={resetOpen} onOpenChange={setResetOpen}
        title={t('users.sendPasswordReset', 'Send password reset')}
        description={t('users.resetDescription', 'Send a password reset link to {email}?', { email: user.email })}
        confirmText={t('users.sendPasswordReset', 'Send password reset')}
        variant="default" loading={resetPassword.isPending} onConfirm={() => resetPassword.mutate()} />
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleFormSubmit}
        defaultValues={user}
        roles={rolesData?.data || []}
        assignmentTargets={assignmentTargets}
        isLoading={updateMutation.isPending}
        canManageRole={canAdmin}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t(isActive ? 'users.confirmDeactivate' : 'users.confirmActivate')}
        description={t(isActive ? 'users.confirmDeactivateDesc' : 'users.confirmActivateDesc', isActive ? 'Deactivate {name}?' : 'Activate {name}?', { name: `${user.firstName} ${user.lastName}` })}
        onConfirm={() => toggleActiveMutation.mutate()}
        loading={toggleActiveMutation.isPending}
        confirmText={t(isActive ? 'users.deactivate' : 'users.activate')}
        variant={isActive ? 'destructive' : 'default'}
      />
    </div>
  );
}

function SidebarInfoItem({ icon: Icon, label, value, copyable }) {
  const { t } = useLanguage();
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
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
      {copyable && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => { navigator.clipboard.writeText(value); showSuccess(t('common.copied', 'Copied')); }}
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
        <p className="text-sm font-semibold break-words">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed break-words">{description}</p>}
      </div>
    </div>
  );
}

function AuditActivityTimeline({ userId }) {
  const { t, locale } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.list({ userId, limit: 20 }),
    queryFn: () => authService.getAuditLog({ userId, limit: 20 }),
    enabled: !!userId,
  });

  const entries = data?.data || [];

  const eventConfig = {
    'login.success': { label: t('users.audit.loginSuccess', 'Sign-in successful'), icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'login.failed': { label: t('users.audit.loginFailed', 'Sign-in failed'), icon: UserX, color: 'text-red-500', bg: 'bg-red-500/10' },
    'logout': { label: t('users.audit.logout', 'Signed out'), icon: ExternalLink, color: 'text-muted-foreground', bg: 'bg-muted' },
    'password.changed': { label: t('users.audit.passwordChanged', 'Password changed'), icon: KeyRound, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'password.reset_requested': { label: t('users.audit.passwordReset', 'Password reset requested'), icon: KeyRound, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'user.updated': { label: t('users.audit.profileUpdated', 'Profile updated'), icon: Pencil, color: 'text-primary', bg: 'bg-primary/10' },
    'user.created': { label: t('users.audit.accountCreated', 'Account created'), icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'session.revoked': { label: t('users.audit.sessionRevoked', 'Session revoked'), icon: Monitor, color: 'text-red-500', bg: 'bg-red-500/10' },
    'account.activated': { label: t('users.audit.accountActivated', 'Account activated'), icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    'role.changed': { label: t('users.audit.roleChanged', 'Role changed'), icon: Shield, color: 'text-brand-500', bg: 'bg-brand-500/10' },
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

  if (!entries.length) return <EmptyState title={t('users.noActivity', "No activities found")} description={t('users.noActivityDesc', 'No activity has been recorded for this user.')} />;

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
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString(getUserDateLocale(locale)) : '\u2014'}
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
