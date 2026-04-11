'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/user-service';
import { roleService } from '@/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { DataTableShell } from '@/components/common/data-table-shell';
import { UserForm } from '@/components/forms/user-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PermissionGate } from '@/components/common/permission-gate';
import { BulkActionsBar } from '@/components/common/bulk-actions-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { showSuccess, showError } from '@/lib/toast';
import {
  Plus, Pencil, UserX, UserCheck, Eye, Download,
  Users, UserCheck2, UserMinus, Clock, Shield,
} from 'lucide-react';

const statusConfig = {
  active: { label: 'Aktiv', variant: 'default', dotColor: 'bg-success' },
  pending_activation: { label: 'Ausstehend', variant: 'secondary', dotColor: 'bg-warning' },
  deactivated: { label: 'Inaktiv', variant: 'outline', dotColor: 'bg-muted-foreground/40' },
  locked: { label: 'Gesperrt', variant: 'destructive', dotColor: 'bg-destructive' },
};

export function UsersTable() {
  const queryClient = useQueryClient();
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
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);
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
      setBulkRoleOpen(false);
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

  // Stats from current data
  const activeCount = users.filter((u) => u.status === 'active' || u.isActive).length;
  const pendingCount = users.filter((u) => u.status === 'pending_activation').length;
  const selectedIds = Object.keys(rowSelection);

  const columns = useMemo(() => [
    {
      accessorKey: 'firstName',
      header: 'Benutzer',
      size: 280,
      Cell: ({ row }) => {
        const u = row.original;
        const initials = `${(u.firstName || '')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase();
        const status = statusConfig[u.status] || statusConfig.active;
        return (
          <Link href={`/settings/users/${u._id}`} className="flex items-center gap-3 hover:text-primary transition-colors group">
            <div className="relative">
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
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
      accessorKey: 'role',
      header: 'Rolle',
      size: 150,
      Cell: ({ row }) => (
        <Badge variant="outline" className="font-medium gap-1.5">
          <Shield className="h-3 w-3" />
          {row.original.role?.name || '\u2014'}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      Cell: ({ row }) => {
        const s = statusConfig[row.original.status] || (row.original.isActive ? statusConfig.active : statusConfig.deactivated);
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      accessorKey: 'language',
      header: 'Sprache',
      size: 80,
      Cell: ({ row }) => (
        <span className="text-xs text-muted-foreground uppercase font-medium">
          {row.original.language || 'de'}
        </span>
      ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Letzter Login',
      size: 160,
      Cell: ({ row }) => {
        const d = row.original.lastLoginAt || row.original.lastLogin;
        if (!d) return <span className="text-xs text-muted-foreground">Nie</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {new Date(d).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
    },
  ], []);

  const handleSubmit = async (data) => {
    if (editUser) {
      await updateMutation.mutateAsync({ id: editUser._id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
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

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Gesamt', value: totalItems, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Aktiv', value: activeCount, icon: UserCheck2, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Ausstehend', value: pendingCount, icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Rollen', value: roles.length, icon: Shield, color: 'text-violet-500', bg: 'bg-violet-500/10' },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-9 w-9 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs rounded-lg">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="pending_activation">Ausstehend</SelectItem>
            <SelectItem value="deactivated">Deaktiviert</SelectItem>
            <SelectItem value="locked">Gesperrt</SelectItem>
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs rounded-lg">
            <SelectValue placeholder="Rolle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Rollen</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'all' || roleFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => { setStatusFilter('all'); setRoleFilter('all'); }}
          >
            Filter zuruecksetzen
          </Button>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <BulkActionsBar
          count={selectedIds.length}
          onClear={() => setRowSelection({})}
        >
          <PermissionGate permission="users:write">
            <Select onValueChange={handleBulkRoleChange}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Rolle aendern" />
              </SelectTrigger>
              <SelectContent>
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
              Deaktivieren
            </Button>
          </PermissionGate>
        </BulkActionsBar>
      )}

      {/* Table */}
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
        renderTopToolbarCustomActions={() => (
          <PermissionGate permission="users:write">
            <Button
              size="sm"
              className="gap-1.5 rounded-lg shadow-sm"
              onClick={() => { setEditUser(null); setFormOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Neuer Benutzer
            </Button>
          </PermissionGate>
        )}
        renderRowActions={({ row }) => (
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/settings/users/${row.original._id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <PermissionGate permission="users:write">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditUser(row.original); setFormOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </PermissionGate>
            <PermissionGate permission="users:admin">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setTargetUser(row.original); setConfirmOpen(true); }}
              >
                {(row.original.status === 'active' || row.original.isActive)
                  ? <UserX className="h-3.5 w-3.5 text-destructive" />
                  : <UserCheck className="h-3.5 w-3.5 text-success" />
                }
              </Button>
            </PermissionGate>
          </div>
        )}
      />

      {/* Dialogs */}
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
