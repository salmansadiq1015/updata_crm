'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/modules/pm/services/project-service';
import { queryKeys } from '@/lib/query/keys';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useProjectMutations } from '@/modules/pm/hooks/use-project-mutations';
import { useStatusMutations } from '@/modules/pm/hooks/use-status-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { PROJECT_TYPE_CONFIG, PROJECT_STATUS_CONFIG, pickProjectAccent } from '@/modules/pm/constants/pm-constants';
import { ProjectForm } from './project-form';
import { ProjectStatusBadge } from './project-status-badge';
import { StatusTransitionDialog } from './status-transition-dialog';
import { StatusHistoryTimeline } from './status-history-timeline';
import { PrepActionsTab } from './prep-actions-tab';
import { ScheduleTab } from './schedule-tab';
import { DocumentsTab } from './documents-tab';
import { RichTextContent } from '@/components/ui/rich-text-content';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Pencil, Copy, Archive, ArrowRight, ChevronRight,
  FolderKanban, Building2, User, Calendar, Wallet, FileText,
  ClipboardList, Clock, ListChecks, CalendarClock,
} from 'lucide-react';

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-80 space-y-4">
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="flex-1 space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="text-sm mt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function ProjectDetail() {
  const { t, language } = useLanguage();
  const { id } = useParams();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const canWrite = hasPermission('projects:write');
  const canDelete = hasPermission('projects:delete');
  const canOverride = hasPermission('projects:admin');

  const { data: project, isLoading } = useQuery({
    queryKey: queryKeys.pm.projects.detail(id),
    queryFn: () => projectService.getProjectById(id),
    enabled: !!id,
  });

  const { update, remove, duplicate } = useProjectMutations({
    onUpdate: () => setFormOpen(false),
    onDelete: () => router.push('/projects'),
    onDuplicate: (res) => {
      if (res?._id) router.push(`/projects/${res._id}`);
    },
  });

  const { transition } = useStatusMutations(id, {
    onTransition: () => setStatusDialogOpen(false),
  });

  if (isLoading) return <DetailSkeleton />;
  if (!project) return <EmptyState title={language === 'de' ? 'Projekt nicht gefunden' : 'Project not found'} description={language === 'de' ? 'Das angeforderte Projekt existiert nicht.' : 'The requested project does not exist.'} />;

  const accent = pickProjectAccent(project);
  const TypeIcon = PROJECT_TYPE_CONFIG[project.projectType]?.icon || FolderKanban;
  const typeLabel = language === 'de' ? PROJECT_TYPE_CONFIG[project.projectType]?.label : PROJECT_TYPE_CONFIG[project.projectType]?.labelEn;
  const isArchived = project.status === 'ARCHIVED';

  const handleEditSubmit = (data) => update.mutateAsync({ id, data });

  const customerName = typeof project.customerId === 'object' ? project.customerId?.name : null;
  const pmName = typeof project.projectManagerId === 'object'
    ? `${project.projectManagerId.firstName || ''} ${project.projectManagerId.lastName || ''}`.trim()
    : null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">
          {t('pm.projects', 'Projects')}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{project.name}</span>
      </nav>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Profile card */}
          <div className="relative rounded-xl border border-border bg-card overflow-hidden shadow-theme-sm">
            <div className={cn('h-1 bg-linear-to-r', accent.bar)} />
            <div className="p-6 text-center">
              <div className="relative inline-flex mb-4">
                <div className={cn('h-20 w-20 rounded-2xl flex items-center justify-center ring-2 shadow-theme-sm', accent.bg, accent.ring)}>
                  <TypeIcon className={cn('h-10 w-10', accent.text)} />
                </div>
              </div>

              <h1 className="text-lg font-bold tracking-tight mb-1 truncate">{project.name}</h1>
              {project.projectNumber && (
                <p className="text-xs font-mono text-muted-foreground mb-3">{project.projectNumber}</p>
              )}

              <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
                <ProjectStatusBadge status={project.status} />
                <span className="text-xs text-muted-foreground">{typeLabel}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-1.5">
                {canWrite && !isArchived && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFormOpen(true)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{language === 'de' ? 'Bearbeiten' : 'Edit'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setStatusDialogOpen(true)}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('pm.changeStatus', 'Change Status')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => duplicate.mutate(id)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('pm.duplicate', 'Duplicate')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                {canDelete && project.status === 'DRAFT' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setArchiveOpen(true)}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('pm.archive', 'Archive')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <Separator />

            {/* Info rows */}
            <div className="p-4 space-y-0.5">
              <InfoRow icon={Building2} label={t('pm.customer', 'Customer')}>
                {customerName && (
                  <Link href={`/crm/customers/${typeof project.customerId === 'object' ? project.customerId._id : project.customerId}`} className="text-primary hover:underline">
                    {customerName}
                  </Link>
                )}
              </InfoRow>
              <InfoRow icon={User} label={t('pm.projectManager', 'Project Manager')}>
                {pmName || null}
              </InfoRow>
              <InfoRow icon={Calendar} label={t('pm.plannedStart', 'Planned Start')}>
                {project.plannedStartDate ? formatDate(project.plannedStartDate) : null}
              </InfoRow>
              <InfoRow icon={Calendar} label={t('pm.plannedEnd', 'Planned End')}>
                {project.plannedEndDate ? formatDate(project.plannedEndDate) : null}
              </InfoRow>
              <InfoRow icon={Wallet} label={t('pm.budget', 'Budget')}>
                {project.estimatedBudget != null
                  ? formatCurrency(project.estimatedBudget, project.currency || 'CHF')
                  : null}
              </InfoRow>
            </div>

            {project.description && (
              <>
                <Separator />
                <div className="p-4">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{t('pm.description', 'Description')}</p>
                  <RichTextContent html={project.description} className="text-sm text-muted-foreground" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
              <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2">
                <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                {t('pm.overview', 'Overview')}
              </TabsTrigger>
              <TabsTrigger value="status" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                {t('pm.statusHistory', 'Status')}
              </TabsTrigger>
              <TabsTrigger value="prep-actions" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2">
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                {t('pm.prepActions', 'Prep Actions')}
              </TabsTrigger>
              <TabsTrigger value="schedule" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2">
                <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                {t('pm.schedule', 'Schedule')}
              </TabsTrigger>
              <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-2">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {t('pm.documents', 'Documents')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-theme-sm space-y-4">
                <h3 className="text-sm font-semibold">{t('pm.overview', 'Overview')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.status', 'Status')}</p>
                    <div className="mt-1"><ProjectStatusBadge status={project.status} /></div>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.projectType', 'Type')}</p>
                    <p className="text-sm mt-1">{typeLabel}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.projectNumber', 'Number')}</p>
                    <p className="text-sm font-mono mt-1">{project.projectNumber}</p>
                  </div>
                  {project.actualStartDate && (
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.actualStart', 'Actual Start')}</p>
                      <p className="text-sm mt-1">{formatDate(project.actualStartDate)}</p>
                    </div>
                  )}
                  {project.actualEndDate && (
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.actualEnd', 'Actual End')}</p>
                      <p className="text-sm mt-1">{formatDate(project.actualEndDate)}</p>
                    </div>
                  )}
                </div>
                {project.notes && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{t('pm.notes', 'Notes')}</p>
                    <RichTextContent html={project.notes} className="text-sm text-muted-foreground mt-1" />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="status" className="mt-6">
              <StatusHistoryTimeline projectId={id} />
            </TabsContent>

            <TabsContent value="prep-actions" className="mt-6">
              <PrepActionsTab projectId={id} />
            </TabsContent>

            <TabsContent value="schedule" className="mt-6">
              <ScheduleTab projectId={id} />
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <DocumentsTab projectId={id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialogs */}
      <ProjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleEditSubmit}
        defaultValues={project}
        isLoading={update.isPending}
      />

      <StatusTransitionDialog
        open={statusDialogOpen}
        onOpenChange={(val) => { if (!val) transition.reset(); setStatusDialogOpen(val); }}
        currentStatus={project.status}
        onSubmit={(data) => transition.mutate(data)}
        isLoading={transition.isPending}
        canOverride={canOverride}
        conflictError={transition.error}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t('pm.archive', 'Archive Project')}
        description={t('pm.confirmArchive', 'Are you sure you want to archive this project?')}
        onConfirm={() => remove.mutate(id)}
        isLoading={remove.isPending}
        variant="destructive"
      />
    </div>
  );
}
