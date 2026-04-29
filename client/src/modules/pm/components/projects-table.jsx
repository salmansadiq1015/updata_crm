'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectService } from '@/modules/pm/services/project-service';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';
import { useProjectMutations } from '@/modules/pm/hooks/use-project-mutations';
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
import { PROJECT_TYPE_CONFIG, pickProjectAccent } from '@/modules/pm/constants/pm-constants';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Plus, Eye, Pencil, Copy, Archive, FolderKanban, Download,
} from 'lucide-react';

export function ProjectsTable() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [myOnly, setMyOnly] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const [formOpen, setFormOpen] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false);

  const apiParams = useMemo(() => {
    const p = {};
    if (debouncedSearch) p.search = debouncedSearch;
    if (statusFilter !== 'all') p.status = statusFilter;
    if (typeFilter !== 'all') p.projectType = typeFilter;
    if (myOnly) p.myOnly = true;
    return p;
  }, [debouncedSearch, statusFilter, typeFilter, myOnly]);

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
  } = useCursorList({
    queryKey: (merged) => queryKeys.pm.projects.list(merged),
    queryFn: (merged) => projectService.getProjects(merged),
    params: apiParams,
    initialSize: 25,
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

  const selectedIds = Object.keys(rowSelection).filter((id) => {
    const p = projects.find((x) => x._id === id);
    return p && p.status === 'DRAFT';
  });

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setMyOnly(false);
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
      Cell: ({ row }) => <ProjectStatusBadge status={row.original.status} size="sm" />,
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
  ], [t, language]);

  const handleSubmit = async (data) => {
    if (editProject?._id) {
      await update.mutateAsync({ id: editProject._id, data });
    } else {
      await create.mutateAsync(data);
    }
    setEditProject(null);
  };

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
        onSearchChange={(val) => { setSearch(val); resetCursor(); }}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => { setStatusFilter(val); resetCursor(); }}
        typeFilter={typeFilter}
        onTypeFilterChange={(val) => { setTypeFilter(val); resetCursor(); }}
        myOnly={myOnly}
        onMyOnlyChange={(val) => { setMyOnly(val); resetCursor(); }}
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
              hidden: !hasPermission('projects:write'),
            },
            {
              label: t('pm.duplicate', 'Duplicate'),
              icon: Copy,
              onSelect: () => duplicate.mutate(row.original._id),
              hidden: !hasPermission('projects:write'),
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
              hidden: !hasPermission('projects:delete') || row.original.status !== 'DRAFT',
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
    </div>
  );
}
