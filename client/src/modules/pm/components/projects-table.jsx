'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectService } from '@/modules/pm/services/project-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useProjectMutations } from '@/modules/pm/hooks/use-project-mutations';
import { useStatusMutations } from '@/modules/pm/hooks/use-status-mutations';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { ProjectForm } from '@/modules/pm/components/project-form';
import { ProjectFilterBar } from '@/modules/pm/components/project-filter-bar';
import { ProjectStatsRow } from '@/modules/pm/components/project-stats-row';
import { ProjectStatusBadge } from '@/modules/pm/components/project-status-badge';
import { MilestonesWidget } from '@/modules/pm/components/milestones-widget';
import { StatusTransitionDialog } from '@/modules/pm/components/status-transition-dialog';
import {
  PROJECT_TYPE_CONFIG, pickProjectAccent, STATUS_TRANSITIONS, PROJECT_STATUS_CONFIG,
} from '@/modules/pm/constants/pm-constants';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Plus, Eye, Pencil, Copy, Archive, FolderKanban, Download, ArrowUpDown,
} from 'lucide-react';

export function ProjectsTable() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  // ── Filter state ─────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [myOnly, setMyOnly] = useState(false);
  const [projectManagerId, setProjectManagerId] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [plannedStartFrom, setPlannedStartFrom] = useState(null);
  const [plannedStartTo, setPlannedStartTo] = useState(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  // ── Sort state ───────────────────────────────────────────────────
  // sorting is an array of { id: string, desc: boolean } (TanStack Table shape)
  const [sorting, setSorting] = useState([]);

  // ── Dialog/form state ─────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  // ── Quick status update state ─────────────────────────────────────
  const [statusDialogProject, setStatusDialogProject] = useState(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  // ── Build API params (include sort) ──────────────────────────────
  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.projectType = typeFilter;
    if (myOnly) p.myOnly = true;
    if (projectManagerId) p.projectManagerId = projectManagerId;
    if (customerId) p.customerId = customerId;
    if (plannedStartFrom) p.plannedStartFrom = plannedStartFrom;
    if (plannedStartTo) p.plannedStartTo = plannedStartTo;
    if (includeDeleted) p.includeDeleted = true;
    if (sorting.length > 0) {
      p.sortBy = sorting[0].id;
      p.sortOrder = sorting[0].desc ? 'desc' : 'asc';
    }
    return p;
  }, [
    debouncedSearch, statusFilter, typeFilter, myOnly,
    projectManagerId, customerId, plannedStartFrom, plannedStartTo,
    includeDeleted, sorting,
  ]);

  const {
    items: projects,
    pageSize,
    setPageSize,
    hasNext,
    hasPrev,
    isFetching,
    onNext,
    onPrev,
    reset: resetCursor,
    refetch,
  } = useCursorList({
    queryKey: (merged) => queryKeys.pm.projects.list(merged),
    queryFn: (merged) => projectService.getProjects(merged),
    params: apiParams,
    initialSize: 25,
    refetchInterval: 60000,
  });

  const { create, update, remove, duplicate, bulkDelete, exportCsv } = useProjectMutations({
    onCreate: () => setFormOpen(false),
    onUpdate: () => setFormOpen(false),
    onDelete: () => setConfirmArchiveOpen(false),
    onDuplicate: (res) => {
      if (res?._id) router.push(`/projects/${res._id}`);
    },
    onBulkDelete: () => {
      setRowSelection({});
      setBulkArchiveOpen(false);
    },
  });

  // Status mutation hook — projectId is passed per-call via statusDialogProject
  const { transition: statusTransition } = useStatusMutations(
    statusDialogProject?._id,
    { onTransition: () => setStatusDialogOpen(false) },
  );

  const selectedIds = Object.keys(rowSelection).filter((id) => {
    const p = projects.find((x) => x._id === id);
    return p && p.status === 'DRAFT';
  });

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setMyOnly(false);
    setProjectManagerId(null);
    setCustomerId(null);
    setPlannedStartFrom(null);
    setPlannedStartTo(null);
    setIncludeDeleted(false);
    setSorting([]);
    resetCursor();
  }, [resetCursor]);

  // Wrap resetCursor into every filter change
  const handleFilterChange = useCallback((setter) => (val) => {
    setter(val);
    resetCursor();
  }, [resetCursor]);

  const columns = useMemo(() => [
    {
      accessorKey: 'name',
      header: t('pm.projects', 'Project'),
      size: 320,
      Cell: ({ row }) => {
        const p = row.original;
        const accent = pickProjectAccent(p);
        const TypeIcon = PROJECT_TYPE_CONFIG[p.projectType]?.icon || FolderKanban;
        return (
          <Link href={`/projects/${p._id}`} className="flex items-center gap-3 group min-w-0">
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center ring-1 shrink-0', accent.bg, accent.ring)}>
              <TypeIcon className={cn('h-4 w-4', accent.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {p.name}
                </span>
                {p.projectNumber && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{p.projectNumber}</span>
                )}
                {p.isDeleted && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive shrink-0">
                    {language === 'de' ? 'Gelöscht' : 'Deleted'}
                  </span>
                )}
              </div>
              {p.customerId?.name && (
                <p className="text-xs text-muted-foreground truncate">{p.customerId.name}</p>
              )}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'projectType',
      header: t('pm.projectType', 'Type'),
      size: 150,
      Cell: ({ row }) => {
        const cfg = PROJECT_TYPE_CONFIG[row.original.projectType];
        if (!cfg) return <span className="text-xs text-muted-foreground/60">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {language === 'de' ? cfg.label : cfg.labelEn}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: t('pm.status', 'Status'),
      size: 140,
      Cell: ({ row }) => {
        const p = row.original;
        const validTargets = STATUS_TRANSITIONS[p.status] || [];
        if (!hasPermission('projects:write') || validTargets.length === 0 || p.isDeleted) {
          return <ProjectStatusBadge status={p.status} size="sm" />;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 group/statusbtn"
                onClick={(e) => e.stopPropagation()}
                title={language === 'de' ? 'Status ändern' : 'Change status'}
              >
                <ProjectStatusBadge status={p.status} size="sm" />
                <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 group-hover/statusbtn:text-primary transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              {validTargets.map((target) => {
                const cfg = PROJECT_STATUS_CONFIG[target];
                return (
                  <DropdownMenuItem
                    key={target}
                    className="text-xs gap-2"
                    onSelect={() => {
                      setStatusDialogProject(p);
                      setStatusDialogOpen(true);
                    }}
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', cfg?.dotColor)} />
                    {language === 'de' ? cfg?.label : cfg?.labelEn}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
    {
      accessorKey: 'projectManagerId',
      header: t('pm.projectManager', 'Project Manager'),
      size: 180,
      Cell: ({ row }) => {
        const pm = row.original.projectManagerId;
        if (!pm?.firstName) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs">{pm.firstName} {pm.lastName}</span>;
      },
    },
    {
      accessorKey: 'plannedStartDate',
      header: t('pm.plannedStart', 'Start'),
      size: 110,
      Cell: ({ row }) => {
        const d = row.original.plannedStartDate;
        if (!d) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs">{formatDate(d)}</span>;
      },
    },
    {
      accessorKey: 'estimatedBudget',
      header: t('pm.budget', 'Budget'),
      size: 120,
      Cell: ({ row }) => {
        const b = row.original.estimatedBudget;
        if (!b && b !== 0) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs font-mono">{formatCurrency(b, row.original.currency || 'CHF')}</span>;
      },
    },
  ], [t, language, hasPermission]);

  const handleSubmit = async (data) => {
    if (editProject?._id) {
      await update.mutateAsync({ id: editProject._id, data });
    } else {
      await create.mutateAsync(data);
    }
    setEditProject(null);
  };

  // Sorting change: reset cursor so first page is fetched with new sort
  const handleSortingChange = useCallback((updater) => {
    setSorting((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      resetCursor();
      return next;
    });
  }, [resetCursor]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pm.projects', 'Projects')}
        description={t('pm.projectsDesc', 'Create, manage and track project progress.')}
        count={projects.length}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv.mutate(apiParams)}
          disabled={exportCsv.isPending}
        >
          <Download className="h-4 w-4 mr-1.5" />
          {exportCsv.isPending ? (language === 'de' ? 'Exportiert...' : 'Exporting...') : 'CSV'}
        </Button>
        <PermissionGate permission="projects:write">
          <Button
            onClick={() => {
              setEditProject(null);
              setFormOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('pm.newProject', 'New Project')}
          </Button>
        </PermissionGate>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProjectStatsRow />
        </div>
        <MilestonesWidget />
      </div>

      <ProjectFilterBar
        search={search}
        onSearchChange={handleFilterChange(setSearch)}
        statusFilter={statusFilter}
        onStatusFilterChange={handleFilterChange(setStatusFilter)}
        typeFilter={typeFilter}
        onTypeFilterChange={handleFilterChange(setTypeFilter)}
        myOnly={myOnly}
        onMyOnlyChange={handleFilterChange(setMyOnly)}
        projectManagerId={projectManagerId}
        onProjectManagerIdChange={handleFilterChange(setProjectManagerId)}
        customerId={customerId}
        onCustomerIdChange={handleFilterChange(setCustomerId)}
        plannedStartFrom={plannedStartFrom}
        onPlannedStartFromChange={handleFilterChange(setPlannedStartFrom)}
        plannedStartTo={plannedStartTo}
        onPlannedStartToChange={handleFilterChange(setPlannedStartTo)}
        includeDeleted={includeDeleted}
        onIncludeDeletedChange={handleFilterChange(setIncludeDeleted)}
        onRefresh={refetch}
        onClear={clearFilters}
      />

      <DataTableShell
        columns={columns}
        data={projects}
        isLoading={isFetching && projects.length === 0}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row._id}
        onRowClick={(row) => router.push(`/projects/${row._id}`)}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        manualSorting
        cursorPagination={{
          hasPrev,
          hasNext,
          isFetching,
          onPrev,
          onNext,
          pageSize,
          onPageSizeChange: setPageSize,
        }}
        renderRowActions={({ row }) => (
          <RowActionsMenu items={[
            {
              label: language === 'de' ? 'Anzeigen' : 'View',
              icon: Eye,
              onSelect: () => router.push(`/projects/${row.original._id}`),
            },
            {
              label: language === 'de' ? 'Bearbeiten' : 'Edit',
              icon: Pencil,
              onSelect: () => {
                setEditProject(row.original);
                setFormOpen(true);
              },
              hidden: !hasPermission('projects:write') || row.original.isDeleted,
            },
            {
              label: t('pm.duplicate', 'Duplicate'),
              icon: Copy,
              onSelect: () => duplicate.mutate(row.original._id),
              hidden: !hasPermission('projects:write') || row.original.isDeleted,
            },
            { type: 'separator' },
            {
              label: t('pm.archive', 'Archive'),
              icon: Archive,
              destructive: true,
              onSelect: () => {
                setArchiveTarget(row.original);
                setConfirmArchiveOpen(true);
              },
              hidden: !hasPermission('projects:delete') || row.original.status !== 'DRAFT' || row.original.isDeleted,
            },
          ]} />
        )}
      />

      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setBulkArchiveOpen(true)}
          disabled={selectedIds.length === 0}
        >
          <Archive className="h-3.5 w-3.5 mr-1.5" />
          {t('pm.archive', 'Archive')} ({selectedIds.length})
        </Button>
      </BulkActionsBar>

      <ProjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        defaultValues={editProject}
        isLoading={create.isPending || update.isPending}
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title={t('pm.archive', 'Archive Project')}
        description={t('pm.confirmArchive', 'Are you sure you want to archive this project?')}
        onConfirm={() => remove.mutate(archiveTarget?._id)}
        isLoading={remove.isPending}
        variant="destructive"
      />

      <ConfirmDialog
        open={bulkArchiveOpen}
        onOpenChange={setBulkArchiveOpen}
        title={t('pm.archive', 'Archive Projects')}
        description={`${selectedIds.length} ${language === 'de' ? 'Projekte archivieren?' : 'projects will be archived.'}`}
        onConfirm={() => bulkDelete.mutate(selectedIds)}
        isLoading={bulkDelete.isPending}
        variant="destructive"
      />

      {/* Quick status transition dialog — reuses StatusTransitionDialog */}
      {statusDialogProject && (
        <StatusTransitionDialog
          open={statusDialogOpen}
          onOpenChange={(open) => {
            setStatusDialogOpen(open);
            if (!open) setStatusDialogProject(null);
          }}
          currentStatus={statusDialogProject.status}
          onSubmit={(data) => statusTransition.mutate(data)}
          isLoading={statusTransition.isPending}
          canOverride={hasPermission('projects:admin')}
        />
      )}
    </div>
  );
}
