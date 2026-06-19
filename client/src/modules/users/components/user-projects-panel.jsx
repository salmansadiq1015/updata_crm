'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, RefreshCw, Search, UserPlus } from 'lucide-react';
import { userService } from '@/modules/users/services/user-service';
import { projectService } from '@/modules/pm/services/project-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { showError, showSuccess } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';

const ASSIGNED_PROJECT_PARAMS = {
  limit: 25,
  sortBy: 'projectNumber',
  sortOrder: 'asc',
};

function projectTitle(project) {
  return [project.projectNumber, project.name].filter(Boolean).join(' - ') || project._id;
}

function customerName(project) {
  return project.customerId?.name || project.customerName || null;
}

export function UserProjectsPanel({ userId, canWrite }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const debouncedSearch = useDebounce(projectSearch, 300);

  const assignedQuery = useQuery({
    queryKey: queryKeys.users.projects(userId, ASSIGNED_PROJECT_PARAMS),
    queryFn: () => userService.getAssignedProjects(userId, ASSIGNED_PROJECT_PARAMS),
    enabled: !!userId,
  });

  const projectPickerParams = useMemo(() => ({
    limit: 25,
    sortBy: 'projectNumber',
    sortOrder: 'asc',
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
  }), [debouncedSearch]);

  const projectsQuery = useQuery({
    queryKey: queryKeys.pm.projects.list(projectPickerParams),
    queryFn: () => projectService.getProjects(projectPickerParams),
    enabled: !!userId && canWrite,
  });

  const assignedProjects = useMemo(
    () => assignedQuery.data?.data || [],
    [assignedQuery.data?.data],
  );
  const candidateProjects = useMemo(
    () => projectsQuery.data?.data || [],
    [projectsQuery.data?.data],
  );
  const assignedIds = useMemo(
    () => new Set(assignedProjects.map((project) => project._id || project.id).filter(Boolean)),
    [assignedProjects],
  );
  const availableProjects = useMemo(
    () => candidateProjects.filter((project) => !assignedIds.has(project._id || project.id)),
    [assignedIds, candidateProjects],
  );

  const assignMutation = useMutation({
    mutationFn: () => userService.assignProject(userId, {
      projectId: selectedProjectId,
      assignmentType: 'manager',
    }),
    onSuccess: () => {
      setSelectedProjectId('');
      queryClient.invalidateQueries({ queryKey: queryKeys.users.projects(userId, ASSIGNED_PROJECT_PARAMS) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.projects.all() });
      showSuccess(t('users.projects.assigned', 'Project assigned'));
    },
    onError: (error) => showError(error),
  });

  if (assignedQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (assignedQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          {t('users.projects.loadFailed', 'Project assignments could not be loaded.')}
        </p>
        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => assignedQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(240px,2fr)_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder={t('users.projects.searchPlaceholder', 'Search projects')}
                className="pl-9"
              />
            </div>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder={t('users.projects.selectProject', 'Select project')} />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project._id || project.id} value={project._id || project.id}>
                    {projectTitle(project)}
                  </SelectItem>
                ))}
                {!projectsQuery.isFetching && availableProjects.length === 0 && (
                  <SelectItem value="__empty" disabled>
                    {t('users.projects.noAvailableProjects', 'No available projects')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              className="gap-2"
              disabled={!selectedProjectId || selectedProjectId === '__empty' || assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              {assignMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {t('users.projects.assign', 'Assign')}
            </Button>
          </div>
        </div>
      )}

      {assignedProjects.length === 0 ? (
        <EmptyState
          title={t('users.projects.empty', 'No assigned projects')}
          description={t('users.projects.emptyDesc', 'This user is not assigned to any project yet.')}
        />
      ) : (
        <div className="divide-y rounded-lg border border-border/40 bg-card">
          {assignedProjects.map((project) => (
            <Link
              key={project._id || project.id}
              href={`/projects/${project._id || project.id}`}
              className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{projectTitle(project)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {customerName(project) || t('users.projects.noCustomer', 'No customer')}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {(project.assignmentRoles || []).map((role) => (
                  <Badge key={role} variant="outline" className="capitalize">
                    {role === 'manager'
                      ? t('users.projects.manager', 'Manager')
                      : t('users.projects.team', 'Team')}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
