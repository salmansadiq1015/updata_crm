'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/modules/users/services/user-service';
import { roleService } from '@/modules/roles/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
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
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, UserX, UserCheck, Eye, Download,
  Users, UserCheck2, UserMinus, Clock, Shield,
  LayoutGrid, List, Search, Filter, X, Mail,
  MoreHorizontal, Copy, Phone, Briefcase, ChevronRight,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusConfig = {
  active: { label: 'Aktiv', variant: 'default', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  pending_activation: { label: 'Ausstehend', variant: 'secondary', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400' },
  deactivated: { label: 'Deaktiviert', variant: 'outline', dotColor: 'bg-muted-foreground/40', bgColor: 'bg-muted', textColor: 'text-muted-foreground' },
  locked: { label: 'Gesperrt', variant: 'destructive', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400' },
};

export function UsersTable() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('table');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeactivateOpen, setBulkDeactivateOpen] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: queryKeys.users.list({ ...pagination, sorting, globalFilter, statusFilter, roleFilter }),
    queryFn: () => userService.getUsers({
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      sortBy: sorting[0]?.id || 'createdAt',
      sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
      search: globalFilter || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined,
    }),
  });

  const { data: rolesData } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
  };

  const createMutation = useMutation({
    mutationFn: (data) => userService.createUser(data),
    onSuccess: () => { invalidateAll(); showSuccess('Benutzer erstellt'); },
    onError: (err) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => userService.updateUser(id, data),
    onSuccess: () => { invalidateAll(); showSuccess('Benutzer aktualisiert'); },
    onError: (err) => showError(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => userService.deactivateUser(id),
    onSuccess: () => { invalidateAll(); showSuccess('Benutzer deaktiviert'); setConfirmOpen(false); },
    onError: (err) => showError(err.message),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => userService.activateUser(id),
    onSuccess: () => { invalidateAll(); showSuccess('Benutzer aktiviert'); setConfirmOpen(false); },
    onError: (err) => showError(err.message),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ ids, data }) => userService.bulkUpdate(ids, data),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(`${res?.modifiedCount || 'Alle'} Benutzer aktualisiert`);
      setRowSelection({});
    },
    onError: (err) => showError(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => userService.bulkDelete(ids),
    onSuccess: (res) => {
      invalidateAll();
      showSuccess(`${res?.deactivatedCount || 'Alle'} Benutzer deaktiviert`);
      setRowSelection({});
      setBulkDeactivateOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const users = usersData?.data || [];
  const totalItems = usersData?.pagination?.totalItems || 0;
  const roles = rolesData?.data || [];

  const activeCount = users.filter((u) => u.status === 'active' || u.isActive).length;
  const pendingCount = users.filter((u) => u.status === 'pending_activation').length;
  const inactiveCount = users.filter((u) => u.status === 'deactivated' || (!u.isActive && u.status !== 'active' && u.status !== 'pending_activation' && u.status !== 'locked')).length;
  const selectedIds = Object.keys(rowSelection);
  const hasActiveFilters = statusFilter !== 'all' || roleFilter !== 'all';

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
      header: t('users.department') || 'Abteilung',
      size: 140,
      Cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.department || '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'role',
      header: t('users.role'),
      size: 150,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-violet-500/10 flex items-center justify-center">
            <Shield className="h-3 w-3 text-violet-500" />
          </div>
          <span className="text-sm font-medium">{row.original.role?.name || '\u2014'}</span>
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
              disabled={u.status === 'pending_activation' || u.status === 'locked'}
            />
            <span className={cn('text-xs font-medium', s.textColor)}>
              {s.label}
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
            {new Date(d).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
    },
  ], [t]);

  const handleSubmit = (data) => {
    if (editUser) {
      updateMutation.mutate({ id: editUser._id, data }, {
        onSuccess: () => setEditUser(null),
      });
    } else {
      createMutation.mutate(data, {
        onSuccess: () => setEditUser(null),
      });
    }
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
    setStatusFilter('all');
    setRoleFilter('all');
    setGlobalFilter('');
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{t('users.title')}</h1>
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {totalItems}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t('users.titleDesc') || 'Mitarbeiter anlegen, bearbeiten, Rollen zuweisen und Zugriff verwalten.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-md transition-all',
                viewMode === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-md transition-all',
                viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <PermissionGate permission="users:write">
            <Button
              onClick={() => { setEditUser(null); setFormOpen(true); }}
              className="gap-2 rounded-xl h-10 px-5 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              <Plus className="h-4 w-4" />
              {t('users.newUser')}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: t('users.total') || 'Gesamt',
            value: totalItems,
            icon: Users,
            accent: 'violet',
            trend: '+12%',
          },
          {
            label: t('users.active'),
            value: activeCount,
            icon: UserCheck2,
            accent: 'emerald',
            trend: '+5%',
          },
          {
            label: t('users.pending') || 'Ausstehend',
            value: pendingCount,
            icon: Clock,
            accent: 'amber',
            trend: null,
          },
          {
            label: t('roles.title'),
            value: roles.length,
            icon: Shield,
            accent: 'blue',
            trend: null,
          },
        ].map((stat) => (
          <PremiumStatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border/40 bg-card/50 px-4 py-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">{t('common.filter')}</span>
        </div>

        <div className="w-px h-5 bg-border/60" />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            statusFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary'
          )}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.allStatus') || 'Alle Status'}
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
                {t('users.pending') || 'Ausstehend'}
              </span>
            </SelectItem>
            <SelectItem value="deactivated">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.deactivated') || 'Deaktiviert'}
              </span>
            </SelectItem>
            <SelectItem value="locked">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t('users.locked') || 'Gesperrt'}
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            roleFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary'
          )}>
            <SelectValue placeholder="Rolle" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                {t('users.allRoles') || 'Alle Rollen'}
              </span>
            </SelectItem>
            {roles.map((r, i) => {
              const roleColors = ['bg-violet-500', 'bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-pink-500', 'bg-teal-500'];
              return (
                <SelectItem key={r._id} value={r._id}>
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', roleColors[i % roleColors.length])} />
                    {r.name}
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
              {t('users.resetFilters') || 'Zuruecksetzen'}
            </Button>
          </>
        )}
      </div>

      {/* ── Bulk Actions Bar ── */}
      {selectedIds.length > 0 && (
        <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
          <PermissionGate permission="users:write">
            <Select onValueChange={handleBulkRoleChange}>
              <SelectTrigger className="w-[160px] text-xs">
                <SelectValue placeholder="Rolle aendern" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {roles.map((r) => (
                  <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PermissionGate>
          <PermissionGate permission="users:admin">
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setBulkDeactivateOpen(true)}
            >
              <UserMinus className="h-3.5 w-3.5 mr-1" />
              {t('users.deactivate')}
            </Button>
          </PermissionGate>
        </BulkActionsBar>
      )}

      {/* ── Content: Table or Grid ── */}
      {viewMode === 'table' ? (
        <DataTableShell
          columns={columns}
          data={users}
          isLoading={isLoading}
          rowCount={totalItems}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          renderTopToolbarCustomActions={() => null}
          renderRowActions={({ row }) => {
            const u = row.original;
            const isActive = u.status === 'active' || u.isActive;
            return (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => { setTargetUser(u); setConfirmOpen(true); }}
                        >
                          {isActive
                            ? <UserX className="h-3.5 w-3.5 text-destructive" />
                            : <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          }
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
          isLoading={isLoading}
          onEdit={(u) => { setEditUser(u); setFormOpen(true); }}
          onToggle={(u) => { setTargetUser(u); setConfirmOpen(true); }}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
        />
      )}

      {/* ── Dialogs ── */}
      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editUser}
        roles={roles}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={targetUser?.isActive || targetUser?.status === 'active' ? 'Benutzer deaktivieren?' : 'Benutzer aktivieren?'}
        description={`Moechten Sie ${targetUser?.firstName} ${targetUser?.lastName} wirklich ${targetUser?.isActive || targetUser?.status === 'active' ? 'deaktivieren' : 'aktivieren'}?`}
        onConfirm={handleToggleActive}
        loading={deactivateMutation.isPending || activateMutation.isPending}
        confirmText={targetUser?.isActive || targetUser?.status === 'active' ? 'Deaktivieren' : 'Aktivieren'}
        variant={targetUser?.isActive || targetUser?.status === 'active' ? 'destructive' : 'default'}
      />

      <ConfirmDialog
        open={bulkDeactivateOpen}
        onOpenChange={setBulkDeactivateOpen}
        title={`${selectedIds.length} Benutzer deaktivieren?`}
        description="Die ausgewaehlten Benutzer werden deaktiviert und koennen sich nicht mehr anmelden."
        onConfirm={() => bulkDeleteMutation.mutate(selectedIds)}
        loading={bulkDeleteMutation.isPending}
        confirmText="Alle deaktivieren"
        variant="destructive"
      />
    </div>
  );
}

/* ── Card Grid View ── */
function UserCardGrid({ users, isLoading, onEdit, onToggle, globalFilter, onGlobalFilterChange }) {
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ user, onEdit, onToggle }) {
  const { t } = useLanguage();
  const initials = `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
  const status = statusConfig[user.status] || statusConfig.active;
  const isActive = user.status === 'active' || user.isActive;
  const lastLogin = user.lastLoginAt || user.lastLogin;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden group hover:border-border/70 hover:shadow-md transition-all duration-200">
      {/* Top gradient accent */}
      <div className={cn('h-1', isActive ? 'bg-linear-to-r from-primary/60 to-primary/20' : 'bg-linear-to-r from-muted-foreground/20 to-transparent')} />

      <div className="p-5">
        {/* Header: Avatar + Name + Actions */}
        <div className="flex items-start justify-between mb-4">
          <Link href={`/settings/users/${user._id}`} className="flex items-center gap-3 group/link min-w-0">
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
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5 -mr-1">
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
              <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(user.email); showSuccess('E-Mail kopiert'); }} className="gap-2">
                <Copy className="h-3.5 w-3.5" />
                {t('users.copyEmail')}
              </DropdownMenuItem>
              <PermissionGate permission="users:admin">
                <DropdownMenuSeparator />
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
            <div className="h-5 w-5 rounded bg-violet-500/10 flex items-center justify-center shrink-0">
              <Shield className="h-3 w-3 text-violet-500" />
            </div>
            <span className="text-xs font-medium">{user.role?.name || '\u2014'}</span>
          </div>
          {/* Department */}
          {user.department && (
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                <Briefcase className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{user.department}</span>
            </div>
          )}
          {/* Status pill */}
          <div className="flex items-center justify-between pt-1">
            <span className={cn('inline-flex items-center gap-1.5 text-[0.65rem] font-medium px-2 py-0.5 rounded-full', status.bgColor, status.textColor)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', status.dotColor)} />
              {status.label}
            </span>
            {lastLogin && (
              <span className="text-[0.65rem] text-muted-foreground/60">
                {new Date(lastLogin).toLocaleDateString('de-CH')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Premium Stat Card ── */
const ACCENT_THEMES = {
  violet: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-violet-500/10',
    iconRing: 'ring-violet-500/20',
    iconColor: 'text-violet-500',
    valueGlow: 'text-violet-500 dark:text-violet-400',
    trendBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    bar: 'from-violet-500 to-transparent',
  },
  emerald: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.25),transparent_60%)]',
    iconBg: 'bg-emerald-500/10',
    iconRing: 'ring-emerald-500/20',
    iconColor: 'text-emerald-500',
    valueGlow: 'text-emerald-600 dark:text-emerald-400',
    trendBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    bar: 'from-emerald-500 to-transparent',
  },
  amber: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(245_158_11_/_0.25),transparent_60%)]',
    iconBg: 'bg-amber-500/10',
    iconRing: 'ring-amber-500/20',
    iconColor: 'text-amber-500',
    valueGlow: 'text-amber-600 dark:text-amber-400',
    trendBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    bar: 'from-amber-500 to-transparent',
  },
  blue: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(59_130_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-blue-500/10',
    iconRing: 'ring-blue-500/20',
    iconColor: 'text-blue-500',
    valueGlow: 'text-blue-600 dark:text-blue-400',
    trendBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    bar: 'from-blue-500 to-transparent',
  },
};

function PremiumStatCard({ label, value, icon: Icon, accent, trend }) {
  const theme = ACCENT_THEMES[accent] || ACCENT_THEMES.violet;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-theme-sm transition-all duration-300 hover:shadow-theme-md hover:-translate-y-0.5">
      {/* Top accent bar */}
      <div className={cn('absolute left-0 right-0 top-0 h-px bg-linear-to-r', theme.bar)} />

      {/* Ambient glow */}
      <div className={cn('pointer-events-none absolute inset-0 opacity-60 transition-opacity group-hover:opacity-100', theme.glow)} />

      {/* Content */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={cn('text-3xl font-bold tracking-tight leading-none', theme.valueGlow)}>
              {value}
            </p>
            {trend && (
              <span className={cn('inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md', theme.trendBg)}>
                {trend}
              </span>
            )}
          </div>
        </div>

        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-110',
          theme.iconBg,
          theme.iconRing,
        )}>
          <Icon className={cn('h-5 w-5', theme.iconColor)} />
        </div>
      </div>
    </div>
  );
}
