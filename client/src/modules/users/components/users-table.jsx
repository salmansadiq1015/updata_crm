'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/modules/users/services/user-service';
import { roleService } from '@/modules/roles/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { HeroStat } from '@/shared/components/hero-art';
import { PageHero, heroButton } from '@/shared/components/page-hero';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { UserDeleteDialog } from '@/modules/users/components/user-delete-dialog';
import { UserForm } from '@/modules/users/components/user-form';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PermissionGate } from '@/shared/components/permission-gate';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { getUserDateLocale, getUserRoleLabel, getUserDepartmentLabel } from '@/modules/users/utils/user-display';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, UserX, UserCheck, Eye, Download, Trash2,
  Users, UserCheck2, UserMinus, Clock, Shield,
  LayoutGrid, List, Search, Filter, X, Mail,
  MoreHorizontal, Copy, Phone, Briefcase, ChevronRight,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusConfig = {
  active: { labelKey: 'users.active', fallback: 'Aktiv', variant: 'default', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  pending_activation: { labelKey: 'users.pending', fallback: 'Nicht aktiviert', variant: 'secondary', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400' },
  deactivated: { labelKey: 'users.deactivated', fallback: 'Deaktiviert', variant: 'outline', dotColor: 'bg-muted-foreground/40', bgColor: 'bg-muted', textColor: 'text-muted-foreground' },
  locked: { labelKey: 'users.locked', fallback: 'Gesperrt', variant: 'destructive', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400' },
};

export function UsersTable() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('table');
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [requestedAction, setRequestedAction] = useQueryState('action');
  const { hasPermission } = usePermissions();
  const canCreateUser = hasPermission('users:write');
  const canManageUserStatus = hasPermission('users:admin');

  useEffect(() => {
    if (requestedAction !== 'create') return;
    if (canCreateUser) {
      setEditUser(null);
      setFormOpen(true);
    }
    void setRequestedAction(null, { history: 'replace' });
  }, [requestedAction, canCreateUser, setRequestedAction]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState([]);
  const debouncedGlobalFilter = useDebounce(globalFilter, 300);
  // Totals across all employees (the list below is paged, so it cannot count them).
  const statsQuery = useQuery({ queryKey: queryKeys.users.stats(), queryFn: () => apiClient.get(ENDPOINTS.USERS.STATS).then((res) => res?.data ?? res), staleTime: 30_000 });
  const stats = statsQuery.data;
  const num = (value) => (value == null ? '—' : new Intl.NumberFormat(locale).format(value));

  const userListParams = useMemo(() => ({
    sortBy: sorting[0]?.id || 'createdAt',
    sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
    ...(debouncedGlobalFilter ? { search: debouncedGlobalFilter } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
  }), [debouncedGlobalFilter, roleFilter, sorting, statusFilter]);

  const {
    items: users,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    isError: usersFailed,
    refetch: refetchUsers,
    onNext,
    onPrev,
    reset: resetCursor,
  } = useCursorList({
    queryKey: (params) => queryKeys.users.list(params),
    queryFn: (params) => userService.getUsers(params),
    params: userListParams,
    initialSize: 25,
  });

  const { data: rolesData } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const { data: assignmentTargets = [] } = useQuery({
    queryKey: queryKeys.users.assignmentTargets(),
    queryFn: () => userService.getAssignmentTargets(),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
  };

  const createMutation = useMutation({
    mutationFn: (data) => userService.createUser(data),
    onSuccess: () => { invalidateAll(); showSuccess(t('users.toastCreated', "User created")); },
    onError: (err) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => userService.updateUser(id, data),
    onSuccess: () => { invalidateAll(); showSuccess(t('users.toastUpdated', "User updated")); },
    onError: (err) => showError(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => userService.deactivateUser(id),
    onSuccess: () => { invalidateAll(); showSuccess(t('users.toastDeactivated', "User deactivated")); setConfirmOpen(false); },
    onError: (err) => showError(err.message),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => userService.activateUser(id),
    onSuccess: () => { invalidateAll(); showSuccess(t('users.toastActivated', "User activated")); setConfirmOpen(false); },
    onError: (err) => showError(err.message),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }) => userService.bulkUpdate(ids, data),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(t('users.toastBulkUpdated', "{count} users updated", {
        count: res?.modifiedCount ?? 0,
      }));
      setRowSelection({});
    },
    onError: (err) => showError(err.message),
  });

  const bulkDeactivateMutation = useMutation({
    mutationFn: (ids) => userService.bulkDeactivate(ids),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(t('users.toastBulkDeactivated', "{count} users deactivated", {
        count: res?.deactivatedCount ?? 0,
      }));
      setRowSelection({});
      setBulkDeactivateOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  useEffect(() => {
    resetCursor();
  }, [resetCursor, userListParams]);

  const totalItems = users.length + (hasNext ? '+' : '');
  const roles = rolesData?.data || [];

  const activeCount = users.filter((u) => u.status === 'active' || u.isActive).length;
  const pendingCount = users.filter((u) => u.status === 'pending_activation').length;
  const inactiveCount = users.filter((u) => u.status === 'deactivated' || (!u.isActive && u.status !== 'active' && u.status !== 'pending_activation' && u.status !== 'locked')).length;
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const hasActiveFilters = statusFilter !== 'all' || roleFilter !== 'all';
  const dateLocale = getUserDateLocale(locale);

  const columns = useMemo(() => [
    {
      accessorKey: 'firstName',
      header: t('users.name'),
      size: 280,
      Cell: ({ row }) => {
        const u = row.original;
        const initials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase();
        const status = statusConfig[u.status] || statusConfig.active;
        return (
          <Link href={`/settings/users/${u._id}`} className="flex items-center gap-3 group">
            <div className="relative">
              <Avatar className="h-9 w-9 border-2 border-background shadow-sm ring-1 ring-border/50">
                <AvatarFallback className="text-xs font-semibold bg-primary/8 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${status.dotColor}`} />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                {u.firstName} {u.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'department',
      header: t('users.department', "Department"),
      size: 140,
      Cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {getUserDepartmentLabel(row.original.department, t) || '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: t('users.role'),
      size: 150,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-brand-500/10 flex items-center justify-center">
            <Shield className="h-3 w-3 text-brand-500" />
          </div>
          <span className="text-sm font-medium">{getUserRoleLabel(row.original.role?.name, t) || '\u2014'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('users.status'),
      size: 150,
      Cell: ({ row }) => {
        const u = row.original;
        const isUserActive = u.status === 'active' || u.isActive;
        const s = statusConfig[u.status] || (isUserActive ? statusConfig.active : statusConfig.deactivated);
        return (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={isUserActive}
              onCheckedChange={() => {
                setTargetUser(u);
                setConfirmOpen(true);
              }}
              disabled={!canManageUserStatus}
              aria-label={`${t(isUserActive ? 'users.deactivate' : 'users.activate')} ${u.firstName} ${u.lastName}`}
            />
            <span className={cn('text-xs font-medium', s.textColor)}>
              {t(s.labelKey, s.fallback)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'lastLoginAt',
      header: t('users.lastLogin'),
      size: 160,
      Cell: ({ row }) => {
        const d = row.original.lastLoginAt || row.original.lastLogin;
        if (!d) return <span className="text-xs text-muted-foreground/60 italic">{t('common.never')}</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {new Date(d).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
    },
  ], [canManageUserStatus, dateLocale, t]);

  const handleSubmit = async (data) => {
    if (editUser) await updateMutation.mutateAsync({ id: editUser._id, data });
    else await createMutation.mutateAsync(data);
    setEditUser(null);
  };

  const handleToggleActive = () => {
    const isActive = targetUser?.status === 'active' || targetUser?.isActive;
    if (isActive) {
      deactivateMutation.mutate(targetUser._id);
    } else {
      activateMutation.mutate(targetUser._id);
    }
  };

  const handleBulkRoleChange = (roleId) => {
    bulkUpdateMutation.mutate({ ids: selectedIds, data: { roleId } });
  };

  const clearFilters = () => {
    setRowSelection({});
    setStatusFilter('all');
    setRoleFilter('all');
    setGlobalFilter('');
    resetCursor();
  };

  const targetIsActive = targetUser?.isActive || targetUser?.status === 'active';
  const targetUserName = [targetUser?.firstName, targetUser?.lastName].filter(Boolean).join(' ')
    || t('users.thisUser', "this user");

  return (
    <div className="space-y-6">
      <PageHero
        id="users-title"
        art="/hero/employees"
        icon={Users}
        eyebrow={t('sidebar.employmentManagement', 'Employee Management')}
        title={t('usersHero.title', 'The people behind every job.')}
        subtitle={t('users.titleDesc', "Create, edit employees, assign roles and manage access.")}
        actions={<>
          <div role="group" aria-label={t('usersHero.layout', 'Layout')} className="flex h-11 items-center rounded-full border border-white/15 bg-white/[0.07] p-1 backdrop-blur-md">
            {[['table', List, t('usersHero.table', 'Table view')], ['grid', LayoutGrid, t('usersHero.grid', 'Card view')]].map(([mode, Icon, label]) => (
              <button key={mode} type="button" aria-label={label} title={label} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}
                className={cn('grid size-9 place-items-center rounded-full transition', viewMode === mode ? 'bg-white/20 text-white' : 'text-slate-300 hover:text-white')}>
                <Icon className="size-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          <PermissionGate permission="users:write">
            <button type="button" className={heroButton.primary} onClick={() => { setEditUser(null); setFormOpen(true); }}><Plus aria-hidden="true" />{t('users.newUser')}</button>
          </PermissionGate>
        </>}
        stats={<>
          <HeroStat icon={Users} label={t('users.total', "Total")} value={num(stats?.total)} hint={stats?.newThisMonth != null ? t('usersHero.newThisMonth', '{count} joined this month', { count: num(stats.newThisMonth) }) : undefined} loading={statsQuery.isLoading} />
          <button type="button" onClick={() => setStatusFilter('active')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
            <HeroStat icon={UserCheck2} tone="text-emerald-300" label={t('users.active')} value={num(stats?.byStatus?.active)} hint={t('usersHero.activeHint', 'Can sign in')} loading={statsQuery.isLoading} />
          </button>
          <button type="button" onClick={() => setStatusFilter('pending_activation')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
            <HeroStat icon={Clock} tone="text-amber-300" label={t('users.pending', "Not activated")} value={num(stats?.byStatus?.pending_activation)} hint={t('usersHero.pendingHint', 'Invitation not confirmed')} loading={statsQuery.isLoading} />
          </button>
          <HeroStat icon={Shield} tone="text-cyan-300" label={t('roles.title')} value={num(stats?.roles ?? roles.length)} hint={t('usersHero.inactive', '{count} deactivated', { count: num(stats?.byStatus?.deactivated) })} loading={statsQuery.isLoading} />
        </>}
      />

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border/40 bg-card/50 px-4 py-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">{t('common.filter')}</span>
        </div>

        <div className="w-px h-5 bg-border/60" />

        <Select value={statusFilter} onValueChange={(value) => { setRowSelection({}); setStatusFilter(value); }}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            statusFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary'
          )}>
            <SelectValue placeholder={t('users.status')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.allStatus', "All Status")}
              </span>
            </SelectItem>
            <SelectItem value="active">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t('users.active')}
              </span>
            </SelectItem>
            <SelectItem value="pending_activation">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t('users.pending', "Not activated")}
              </span>
            </SelectItem>
            <SelectItem value="deactivated">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.deactivated', "Deactivated")}
              </span>
            </SelectItem>
            <SelectItem value="locked">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t('users.locked', "Locked")}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={(value) => { setRowSelection({}); setRoleFilter(value); }}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            roleFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary'
          )}>
            <SelectValue placeholder={t('users.role')} />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.allRoles', "All Roles")}
              </span>
            </SelectItem>
            {roles.map((r, i) => {
              const roleColors = ['bg-brand-500', 'bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'];
              return (
                <SelectItem key={r._id} value={r._id}>
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', roleColors[i % roleColors.length])} />
                    {getUserRoleLabel(r.name, t)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-border/60" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground gap-1 rounded-full hover:text-destructive"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" />
              {t('users.resetFilters', "Reset filters")}
            </Button>
          </>
        )}
      </div>

      {/* ── Bulk Actions Bar ── */}
      {selectedIds.length > 0 && (
        <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
          <PermissionGate permission="users:admin">
            <Select onValueChange={handleBulkRoleChange}>
              <SelectTrigger className="w-[160px] text-xs">
                <SelectValue placeholder={t('users.changeRole')} />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {roles.map((r) => (
                  <SelectItem key={r._id} value={r._id}>{getUserRoleLabel(r.name, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PermissionGate>
          <PermissionGate permission="users:admin">
            <Button variant="outline" size="sm" disabled={bulkUpdateMutation.isPending}
              onClick={() => bulkUpdateMutation.mutate({ ids: selectedIds, data: { status: 'active' } })}>
              <UserCheck className="h-3.5 w-3.5 mr-1" />{t('users.activate')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setBulkDeactivateOpen(true)}
            >
              <UserMinus className="h-3.5 w-3.5 mr-1" />
              {t('users.deactivate')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteIds(selectedIds)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />{t('users.delete', 'Delete')}
            </Button>
          </PermissionGate>
        </BulkActionsBar>
      )}

      {usersFailed && <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/30 p-4">
        <p>{t('users.loadError', 'Unable to load user data.')}</p>
        <Button variant="outline" onClick={() => refetchUsers()}>{t('common.retry', "Retry")}</Button>
      </div>}
      {/* ── Content: Table or Grid ── */}
      {viewMode === 'table' ? (
        <DataTableShell
          columns={columns}
          data={users}
          isLoading={isFetching && users.length === 0}
          rowCount={users.length}
          sorting={sorting}
          onSortingChange={setSorting}
          globalFilter={globalFilter}
          onGlobalFilterChange={(value) => { setRowSelection({}); setGlobalFilter(value); }}
          enableRowSelection={canManageUserStatus}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={(u) => router.push(`/settings/users/${u._id}`)}
          cursorPagination={{
            pageSize,
            onPageSizeChange: (size) => { setRowSelection({}); setPageSize(size); },
            hasNext,
            hasPrev,
            isFetching,
            onNext: () => { setRowSelection({}); onNext(); },
            onPrev: () => { setRowSelection({}); onPrev(); },
          }}
          renderTopToolbarCustomActions={() => null}
          renderRowActions={({ row }) => {
            const u = row.original;
            const isActive = u.status === 'active' || u.isActive;
            return (
              <div className="flex items-center gap-0.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
                        <Link href={`/settings/users/${u._id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('common.view')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <PermissionGate permission="users:write">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setEditUser(u); setFormOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.edit')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </PermissionGate>

                <PermissionGate permission="users:admin">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`${t('users.delete', 'Delete')} ${u.firstName} ${u.lastName}`} onClick={() => setDeleteIds([u._id])}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={isActive ? t('users.deactivate') : t('users.activate')}
                          className="h-8 w-8 rounded-lg"
                          onClick={() => { setTargetUser(u); setConfirmOpen(true); }}
                        >
                          {isActive
                            ? <UserX className="h-3.5 w-3.5 text-destructive" />
                            : <UserCheck className="h-3.5 w-3.5 text-emerald-600" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isActive ? t('users.deactivate') : t('users.activate')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </PermissionGate>
              </div>
            );
          }}
        />
      ) : (
        <UserCardGrid
          users={users}
          isLoading={isFetching && users.length === 0}
          onEdit={(u) => { setEditUser(u); setFormOpen(true); }}
          onToggle={(u) => { setTargetUser(u); setConfirmOpen(true); }}
          onDelete={(u) => setDeleteIds([u._id])}
          canSelect={canManageUserStatus}
          rowSelection={rowSelection}
          onSelect={(id, checked) => setRowSelection((previous) => ({ ...previous, [id]: checked }))}
          globalFilter={globalFilter}
          onGlobalFilterChange={(value) => { setRowSelection({}); setGlobalFilter(value); }}
        />
      )}

      {/* ── Dialogs ── */}
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editUser}
        roles={roles}
        assignmentTargets={assignmentTargets}
        isLoading={createMutation.isPending || updateMutation.isPending}
        canManageRole={canManageUserStatus}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={targetIsActive ? t('users.confirmDeactivate') : t('users.confirmActivate')}
        description={
          targetIsActive
            ? t('users.confirmDeactivateDesc', "Do you really want to deactivate {name}?", { name: targetUserName })
            : t('users.confirmActivateDesc', "Do you really want to activate {name}?", { name: targetUserName })
        }
        onConfirm={handleToggleActive}
        loading={deactivateMutation.isPending || activateMutation.isPending}
        confirmText={targetIsActive ? t('users.deactivate') : t('users.activate')}
        variant={targetIsActive ? 'destructive' : 'default'}
      />

      <UserDeleteDialog ids={deleteIds} open={deleteIds.length > 0}
        onOpenChange={(open) => { if (!open) setDeleteIds([]); }}
        onDeleted={() => { setRowSelection({}); resetCursor(); }} />

      <ConfirmDialog
        open={bulkDeactivateOpen}
        onOpenChange={setBulkDeactivateOpen}
        title={t('users.bulkConfirmDeactivateTitle', "Deactivate {count} users?", { count: selectedIds.length })}
        description={t('users.bulkConfirmDeactivateDesc', "The selected users will be deactivated and will no longer be able to sign in.")}
        onConfirm={() => bulkDeactivateMutation.mutate(selectedIds)}
        loading={bulkDeactivateMutation.isPending}
        confirmText={t('users.deactivateAll')}
        variant="destructive"
      />
    </div>
  );
}

/* ── Card Grid View ── */
function UserCardGrid({ users, isLoading, onEdit, onToggle, onDelete, canSelect, rowSelection, onSelect, globalFilter, onGlobalFilterChange }) {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border/60 bg-muted/40 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            placeholder={t('users.search')}
            disabled
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-11 w-11 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-28 bg-muted rounded" />
                  <div className="h-3 w-36 bg-muted rounded" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Grid Search */}
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-border/60 bg-muted/40 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          placeholder={t('users.search')}
        />
      </div>

      {/* Grid */}
      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm font-medium">{t('common.noUsers')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {users.map((user) => (
            <UserCard
              key={user._id}
              user={user}
              onEdit={() => onEdit(user)}
              onToggle={() => onToggle(user)}
              onDelete={() => onDelete(user)}
              canSelect={canSelect}
              selected={Boolean(rowSelection[user._id])}
              onSelect={(checked) => onSelect(user._id, checked)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ user, onEdit, onToggle, onDelete, canSelect, selected, onSelect }) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const initials = `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  const status = statusConfig[user.status] || statusConfig.active;
  const isActive = user.status === 'active' || user.isActive;
  const lastLogin = user.lastLoginAt || user.lastLogin;
  const dateLocale = getUserDateLocale(locale);

  return (
    <div
      onClick={() => router.push(`/settings/users/${user._id}`)}
      className="rounded-xl border border-border/40 bg-card overflow-hidden group hover:border-border/70 hover:shadow-md transition-all duration-200 cursor-pointer"
    >
      {/* Top gradient accent */}
      <div className={cn('h-1', isActive ? 'bg-linear-to-r from-primary/60 to-primary/20' : 'bg-linear-to-r from-muted-foreground/20 to-transparent')} />

      <div className="p-5">
        {canSelect && <label className="flex items-center gap-2 mb-3 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} />
          {t('users.selectUser', 'Select {name}', { name: `${user.firstName} ${user.lastName}` })}
        </label>}
        {/* Header: Avatar + Name + Actions */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/settings/users/${user._id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-3 group/link min-w-0">
            <div className="relative shrink-0">
              <Avatar className="h-11 w-11 border-2 border-background shadow-sm ring-1 ring-border/50">
                <AvatarFallback className="text-sm font-bold bg-primary/8 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className={cn('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card', status.dotColor)} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate group-hover/link:text-primary transition-colors">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </Link>

          {/* Quick Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`${t('common.actions', "Actions")} ${user.firstName} ${user.lastName}`} onClick={(e) => e.stopPropagation()} className="h-7 w-7 rounded-md -mt-0.5 -mr-1">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href={`/settings/users/${user._id}`} className="gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  {t('common.view')}
                </Link>
              </DropdownMenuItem>
              <PermissionGate permission="users:write">
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-3.5 w-3.5" />
                  {t('common.edit')}
                </DropdownMenuItem>
              </PermissionGate>
              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(user.email); showSuccess(t('users.toastEmailCopied', "Email copied")); }} className="gap-2">
                <Copy className="h-3.5 w-3.5" />
                {t('users.copyEmail')}
              </DropdownMenuItem>
              <PermissionGate permission="users:admin">
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />{t('users.delete', 'Delete')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onToggle}
                  className={cn('gap-2', isActive ? 'text-destructive focus:text-destructive' : 'text-emerald-600 focus:text-emerald-600')}
                >
                  {isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  {isActive ? t('users.deactivate') : t('users.activate')}
                </DropdownMenuItem>
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Info rows */}
        <div className="space-y-2.5">
          {/* Role */}
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-brand-500/10 flex items-center justify-center shrink-0">
              <Shield className="h-3 w-3 text-brand-500" />
            </div>
              <span className="text-xs font-medium">{getUserRoleLabel(user.role?.name, t) || '\u2014'}</span>
          </div>
          {/* Department */}
          {user.department && (
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                <Briefcase className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{getUserDepartmentLabel(user.department, t)}</span>
            </div>
          )}
          {/* Status pill */}
          <div className="flex items-center justify-between pt-1">
            <span className={cn('inline-flex items-center gap-1.5 text-[0.65rem] font-medium px-2 py-0.5 rounded-full', status.bgColor, status.textColor)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', status.dotColor)} />
              {t(status.labelKey, status.fallback)}
            </span>
            {lastLogin && (
              <span className="text-[0.65rem] text-muted-foreground/60">
                {new Date(lastLogin).toLocaleDateString(dateLocale)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
