'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleService } from '@/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { DataTableShell } from '@/components/common/data-table-shell';
import { RoleForm } from '@/components/forms/role-form';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PermissionGate } from '@/components/common/permission-gate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { showSuccess, showError } from '@/lib/toast';
import { Plus, Pencil, Trash2, Eye, Shield, Copy, Users, Lock } from 'lucide-react';

export function RolesTable() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: rolesData, isLoading } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => roleService.createRole(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess('Rolle erstellt');
    },
    onError: (err) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => roleService.updateRole(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess('Rolle aktualisiert');
    },
    onError: (err) => showError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => roleService.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
      showSuccess('Rolle geloescht');
      setConfirmOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const roles = rolesData?.data || [];
  const systemCount = roles.filter((r) => r.isSystem).length;
  const customCount = roles.filter((r) => !r.isSystem).length;

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Rolle',
      size: 220,
      Cell: ({ row }) => (
        <Link href={`/settings/roles/${row.original._id}`} className="flex items-center gap-3 hover:text-primary transition-colors group">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm group-hover:text-primary transition-colors">{row.original.name}</span>
              {row.original.isSystem && (
                <Lock className="h-3 w-3 text-muted-foreground/50" />
              )}
            </div>
            {row.original.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{row.original.description}</p>
            )}
          </div>
        </Link>
      ),
    },
    {
      accessorKey: 'permissions',
      header: 'Berechtigungen',
      size: 130,
      Cell: ({ row }) => {
        const count = row.original.permissions?.length || 0;
        return (
          <Badge variant="secondary" className="font-mono text-xs">
            {count} {count === 1 ? 'Berechtigung' : 'Berechtigungen'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'userCount',
      header: 'Benutzer',
      size: 100,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{row.original.userCount ?? 0}</span>
        </div>
      ),
    },
    {
      accessorKey: 'isSystem',
      header: 'Typ',
      size: 100,
      Cell: ({ row }) => (
        <Badge variant={row.original.isSystem ? 'outline' : 'secondary'}>
          {row.original.isSystem ? 'System' : 'Benutzerdefiniert'}
        </Badge>
      ),
    },
  ], []);

  const handleSubmit = async (data) => {
    if (editRole) {
      await updateMutation.mutateAsync({ id: editRole._id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
    setEditRole(null);
  };

  const handleClone = (role) => {
    setEditRole(null);
    setFormOpen(true);
    // Pre-fill form with cloned data (without _id so it creates a new one)
    setTimeout(() => {
      setEditRole({
        name: `${role.name} (Kopie)`,
        description: role.description,
        permissions: role.permissions,
        // No _id so form treats it as create
      });
    }, 50);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Gesamt', value: roles.length, icon: Shield, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'System', value: systemCount, icon: Lock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { label: 'Benutzerdefiniert', value: customCount, icon: Plus, color: 'text-success', bg: 'bg-success/10' },
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

      {/* Table */}
      <DataTableShell
        columns={columns}
        data={roles}
        isLoading={isLoading}
        rowCount={roles.length}
        manualPagination={false}
        manualSorting={false}
        manualFiltering={false}
        renderTopToolbarCustomActions={() => (
          <PermissionGate permission="roles:admin">
            <Button
              size="sm"
              className="gap-1.5 rounded-lg shadow-sm"
              onClick={() => { setEditRole(null); setFormOpen(true); }}
            >
              <Plus className="h-4 w-4" />
              Neue Rolle
            </Button>
          </PermissionGate>
        )}
        renderRowActions={({ row }) => (
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/settings/roles/${row.original._id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <PermissionGate permission="roles:admin">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setEditRole(row.original); setFormOpen(true); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleClone(row.original)}
                title="Rolle duplizieren"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {!row.original.isSystem && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => { setDeleteTarget(row.original); setConfirmOpen(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </PermissionGate>
          </div>
        )}
      />

      <RoleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editRole}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Rolle loeschen?"
        description={`Moechten Sie die Rolle "${deleteTarget?.name}" wirklich loeschen?${
          (deleteTarget?.userCount > 0) ? ` Diese Rolle ist ${deleteTarget.userCount} Benutzern zugewiesen.` : ''
        }`}
        onConfirm={() => deleteMutation.mutate(deleteTarget?._id)}
        loading={deleteMutation.isPending}
        confirmText="Loeschen"
        variant="destructive"
      />
    </div>
  );
}
