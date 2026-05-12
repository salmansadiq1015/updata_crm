'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { roleService } from '@/modules/roles/services/role-service';
import { queryKeys } from '@/lib/query/keys';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RoleForm } from '@/modules/roles/components/role-form';
import { RoleCard } from '@/modules/roles/components/role-card';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { PermissionGate } from '@/shared/components/permission-gate';
import { PageHeader } from '@/shared/components/page-header';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  Plus, Pencil, Trash2, Eye, Shield, Copy, Users, Lock,
  LayoutGrid, List, Search, Filter, X, MoreHorizontal,
  ShieldCheck, Key, Sparkles, UserMinus,
} from 'lucide-react';

/**
 * Roles that can NEVER be deleted even if not flagged `isSystem`.
 * These are functional core roles the platform depends on.
 */
const PROTECTED_ROLE_NAMES = ['Admin', 'User'];

const isProtectedRole = (role) =>
  !!role?.isSystem || PROTECTED_ROLE_NAMES.includes(role?.name);

export function RolesTable() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('table');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: rolesData, isLoading } = useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: () => roleService.getRoles(),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.roles.all() });
  };

  const createMutation = useMutation({
    mutationFn: (data) => roleService.createRole(data),
    onSuccess: () => { invalidateAll(); showSuccess('Rolle erstellt'); },
    onError: (err) => showError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => roleService.updateRole(id, data),
    onSuccess: () => { invalidateAll(); showSuccess('Rolle aktualisiert'); },
    onError: (err) => showError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => roleService.deleteRole(id),
    onSuccess: () => {
      invalidateAll();
      showSuccess('Rolle geloescht');
      setConfirmOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => roleService.bulkDeleteRoles(ids),
    onSuccess: ({ deletedCount, failed }) => {
      invalidateAll();
      if (deletedCount > 0) showSuccess(`${deletedCount} Rolle(n) geloescht`);
      if (failed > 0) showError(`${failed} Rolle(n) konnten nicht geloescht werden`);
      setRowSelection({});
      setBulkDeleteOpen(false);
    },
    onError: (err) => showError(err.message),
  });

  const roles = rolesData?.data || [];
  const systemCount = roles.filter((r) => r.isSystem).length;
  const customCount = roles.filter((r) => !r.isSystem).length;
  const totalPermissions = roles.reduce((sum, r) => sum + (r.permissions?.length || 0), 0);
  const totalUsers = roles.reduce((sum, r) => sum + (r.userCount || 0), 0);

  // Filter + search
  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      const matchesSearch = !search
        || r.name?.toLowerCase().includes(search.toLowerCase())
        || r.description?.toLowerCase().includes(search.toLowerCase());
      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'system' && r.isSystem) ||
        (typeFilter === 'custom' && !r.isSystem);
      return matchesSearch && matchesType;
    });
  }, [roles, search, typeFilter]);

  const hasActiveFilters = typeFilter !== 'all' || search !== '';

  // Only rows of deletable roles are actually selectable — filter out protected ones
  const selectedIds = Object.keys(rowSelection);
  const deletableSelectedIds = selectedIds.filter((id) => {
    const r = roles.find((role) => role._id === id);
    return r && !isProtectedRole(r);
  });

  const clearFilters = () => {
    setTypeFilter('all');
    setSearch('');
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: 'Rolle',
      size: 280,
      Cell: ({ row }) => {
        const r = row.original;
        const colorIdx = ((r.name || '').charCodeAt(0) || 0) % ROLE_ACCENTS.length;
        const accent = ROLE_ACCENTS[colorIdx];
        return (
          <Link href={`/settings/roles/${r._id}`} className="flex items-center gap-3 group">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 shrink-0', accent.bg, accent.ring)}>
              <Shield className={cn('h-4 w-4', accent.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {r.name}
                </span>
                {r.isSystem && <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
              </div>
              {r.description && (
                <p className="text-xs text-muted-foreground truncate max-w-[260px]">{r.description}</p>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'permissions',
      header: 'Berechtigungen',
      size: 150,
      Cell: ({ row }) => {
        const count = row.original.permissions?.length || 0;
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded bg-violet-500/10 flex items-center justify-center">
              <Key className="h-3 w-3 text-violet-500" />
            </div>
            <span className="text-sm font-medium">{count}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'userCount',
      header: 'Benutzer',
      size: 110,
      Cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-sky-500/10 flex items-center justify-center">
            <Users className="h-3 w-3 text-sky-500" />
          </div>
          <span className="text-sm font-medium">{row.original.userCount ?? 0}</span>
        </div>
      ),
    },
    {
      accessorKey: 'isSystem',
      header: 'Typ',
      size: 140,
      Cell: ({ row }) => {
        const isSystem = row.original.isSystem;
        return (
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            isSystem
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', isSystem ? 'bg-amber-500' : 'bg-emerald-500')} />
            {isSystem ? 'System' : 'Benutzerdefiniert'}
          </span>
        );
      },
    },
  ], []);

  const handleSubmit = (data) => {
    if (editRole?._id) {
      updateMutation.mutate({ id: editRole._id, data }, {
        onSuccess: () => setEditRole(null),
      });
    } else {
      createMutation.mutate(data, {
        onSuccess: () => setEditRole(null),
      });
    }
  };

  const handleClone = (role) => {
    setEditRole(null);
    setFormOpen(true);
    setTimeout(() => {
      setEditRole({
        name: `${role.name} (Kopie)`,
        description: role.description,
        permissions: role.permissions,
      });
    }, 50);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={t('roles.title')}
        description={t('roles.titleDesc') || 'Rollen erstellen, Berechtigungen konfigurieren und Zugriff steuern.'}
        count={roles.length}
      >
        {/* View Toggle */}
        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md transition-all',
              viewMode === 'table' ? 'bg-card shadow-theme-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'flex items-center justify-center h-8 w-8 rounded-md transition-all',
              viewMode === 'grid' ? 'bg-card shadow-theme-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>

        <PermissionGate permission="roles:admin">
          <Button
            onClick={() => { setEditRole(null); setFormOpen(true); }}
            className="gap-2 h-9 shadow-theme-sm hover:shadow-theme-md transition-all"
          >
            <Plus className="h-4 w-4" />
            {t('roles.newRole') || 'Neue Rolle'}
          </Button>
        </PermissionGate>
      </PageHeader>

      {/* Premium Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          label="Gesamt"
          value={roles.length}
          icon={Shield}
          accent="violet"
          sublabel={`${customCount} benutzerdefiniert`}
        />
        <PremiumStatCard
          label="System"
          value={systemCount}
          icon={Lock}
          accent="amber"
          sublabel="geschuetzt"
        />
        <PremiumStatCard
          label="Berechtigungen"
          value={totalPermissions}
          icon={Key}
          accent="blue"
          sublabel="insgesamt vergeben"
        />
        <PremiumStatCard
          label="Zugewiesen"
          value={totalUsers}
          icon={Users}
          accent="emerald"
          sublabel="Benutzer insgesamt"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wider">{t('common.filter')}</span>
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rolle suchen..."
            className="w-full h-8 pl-9 pr-3 rounded-full border border-border bg-card text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-[3px] focus:ring-ring/20 focus:border-ring transition-all"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={cn(
            'w-[170px] text-xs rounded-full border-dashed',
            typeFilter !== 'all' && 'border-primary/40 bg-primary/5 text-primary'
          )}>
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                Alle Typen
              </span>
            </SelectItem>
            <SelectItem value="system">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                System
              </span>
            </SelectItem>
            <SelectItem value="custom">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Benutzerdefiniert
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <div className="w-px h-5 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground gap-1 rounded-full hover:text-destructive"
              onClick={clearFilters}
            >
              <X className="h-3 w-3" />
              Zuruecksetzen
            </Button>
          </>
        )}

        <div className="ml-auto text-xs text-muted-foreground">
          {filteredRoles.length} von {roles.length}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
          <PermissionGate permission="roles:admin">
            {deletableSelectedIds.length > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {deletableSelectedIds.length} loeschen
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Geschuetzte Rollen koennen nicht geloescht werden
              </span>
            )}
            {deletableSelectedIds.length > 0 && deletableSelectedIds.length < selectedIds.length && (
              <span className="text-[11px] text-muted-foreground">
                ({selectedIds.length - deletableSelectedIds.length} geschuetzt)
              </span>
            )}
          </PermissionGate>
        </BulkActionsBar>
      )}

      {/* Content: Table or Grid */}
      {viewMode === 'table' ? (
        <DataTableShell
          columns={columns}
          data={filteredRoles}
          isLoading={isLoading}
          rowCount={filteredRoles.length}
          manualPagination={false}
          manualSorting={false}
          manualFiltering={false}
          enableGlobalFilter={false}
          enableRowSelection
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          renderTopToolbarCustomActions={() => null}
          renderRowActions={({ row }) => (
            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" asChild>
                      <Link href={`/settings/roles/${row.original._id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('common.view')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <PermissionGate permission="roles:admin">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => { setEditRole(row.original); setFormOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('common.edit')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => handleClone(row.original)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('common.duplicate')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {!isProtectedRole(row.original) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setDeleteTarget(row.original); setConfirmOpen(true); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('common.delete')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </PermissionGate>
            </div>
          )}
        />
      ) : (
        <RoleCardGrid
          roles={filteredRoles}
          isLoading={isLoading}
          onEdit={(r) => { setEditRole(r); setFormOpen(true); }}
          onClone={handleClone}
          onDelete={(r) => { setDeleteTarget(r); setConfirmOpen(true); }}
        />
      )}

      {/* Dialogs */}
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

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`${deletableSelectedIds.length} Rolle(n) loeschen?`}
        description="Die ausgewaehlten Rollen werden unwiderruflich geloescht. Geschuetzte System-Rollen (Admin, User) werden uebersprungen."
        onConfirm={() => bulkDeleteMutation.mutate(deletableSelectedIds)}
        loading={bulkDeleteMutation.isPending}
        confirmText="Alle loeschen"
        variant="destructive"
      />
    </div>
  );
}

/* ── Role Card Grid ── */
function RoleCardGrid({ roles, isLoading, onEdit, onClone, onDelete }) {
  const { t } = useLanguage();
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 bg-muted rounded" />
                <div className="h-3 w-36 bg-muted rounded" />
              </div>
            </div>
            <div className="h-3 w-full bg-muted rounded mb-2" />
            <div className="h-3 w-2/3 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!roles.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed border-border bg-card/50">
        <Shield className="h-10 w-10 opacity-30 mb-3" />
        <p className="text-sm font-medium">{t('roles.empty')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {roles.map((role) => (
        <RoleCard
          key={role._id}
          role={role}
          onEdit={() => onEdit(role)}
          onClone={() => onClone(role)}
          onDelete={() => onDelete(role)}
        />
      ))}
    </div>
  );
}

/* ── Role accent color palette ── */
const ROLE_ACCENTS = [
  { bg: 'bg-violet-500/10', ring: 'ring-violet-500/20', text: 'text-violet-500' },
  { bg: 'bg-sky-500/10', ring: 'ring-sky-500/20', text: 'text-sky-500' },
  { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', text: 'text-emerald-500' },
  { bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', text: 'text-amber-500' },
  { bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', text: 'text-rose-500' },
  { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20', text: 'text-indigo-500' },
  { bg: 'bg-pink-500/10', ring: 'ring-pink-500/20', text: 'text-pink-500' },
  { bg: 'bg-teal-500/10', ring: 'ring-teal-500/20', text: 'text-teal-500' },
];

/* ── Premium Stat Card ── */
const ACCENT_THEMES = {
  violet: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-violet-500/10',
    iconRing: 'ring-violet-500/20',
    iconColor: 'text-violet-500',
    valueGlow: 'text-violet-500 dark:text-violet-400',
    bar: 'from-violet-500 to-transparent',
  },
  emerald: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.25),transparent_60%)]',
    iconBg: 'bg-emerald-500/10',
    iconRing: 'ring-emerald-500/20',
    iconColor: 'text-emerald-500',
    valueGlow: 'text-emerald-600 dark:text-emerald-400',
    bar: 'from-emerald-500 to-transparent',
  },
  amber: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(245_158_11_/_0.25),transparent_60%)]',
    iconBg: 'bg-amber-500/10',
    iconRing: 'ring-amber-500/20',
    iconColor: 'text-amber-500',
    valueGlow: 'text-amber-600 dark:text-amber-400',
    bar: 'from-amber-500 to-transparent',
  },
  blue: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(59_130_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-blue-500/10',
    iconRing: 'ring-blue-500/20',
    iconColor: 'text-blue-500',
    valueGlow: 'text-blue-600 dark:text-blue-400',
    bar: 'from-blue-500 to-transparent',
  },
};

function PremiumStatCard({ label, value, icon: Icon, accent, sublabel }) {
  const theme = ACCENT_THEMES[accent] || ACCENT_THEMES.violet;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-theme-sm transition-all duration-300 hover:shadow-theme-md hover:-translate-y-0.5">
      <div className={cn('absolute left-0 right-0 top-0 h-px bg-linear-to-r', theme.bar)} />
      <div className={cn('pointer-events-none absolute inset-0 opacity-60 transition-opacity group-hover:opacity-100', theme.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={cn('text-3xl font-bold tracking-tight leading-none mt-2', theme.valueGlow)}>
            {value}
          </p>
          {sublabel && (
            <p className="text-[11px] text-muted-foreground mt-2">{sublabel}</p>
          )}
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

export { ROLE_ACCENTS };
