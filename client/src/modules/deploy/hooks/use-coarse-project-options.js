'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { projectService } from '@/modules/pm/services/project-service';

const PROJECT_LIST_LIMIT = 20;
const PROJECT_SEARCH_MIN_LENGTH = 2;
const RECENT_PROJECT_PARAMS = {
  limit: PROJECT_LIST_LIMIT,
  sortBy: 'projectNumber',
  sortOrder: 'desc',
};

export function getCoarseProjectId(project) {
  return project?._id || project?.id || '';
}

function normalizeProjects(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.data)) return value.data.data;
  return [];
}

function mergeProjects(...lists) {
  const byId = new Map();
  lists.flat().forEach((project) => {
    const id = getCoarseProjectId(project);
    if (id && !byId.has(id)) byId.set(id, project);
  });
  return Array.from(byId.values());
}

export function useCoarseProjectOptions({ open, search, selectedId }) {
  const debouncedSearch = useDebounce(search.trim(), 250);
  const hasSearch = debouncedSearch.length >= PROJECT_SEARCH_MIN_LENGTH;

  const recentQuery = useQuery({
    queryKey: queryKeys.pm.projects.list(RECENT_PROJECT_PARAMS),
    queryFn: () => projectService.getProjects(RECENT_PROJECT_PARAMS),
    enabled: open,
  });

  const searchQuery = useQuery({
    queryKey: queryKeys.pm.projects.search(debouncedSearch),
    queryFn: () => projectService.searchProjects(debouncedSearch, PROJECT_LIST_LIMIT),
    enabled: open && hasSearch,
  });

  const selectedQuery = useQuery({
    queryKey: queryKeys.pm.projects.detail(selectedId),
    queryFn: () => projectService.getProjectById(selectedId),
    enabled: !!selectedId,
  });

  const recentProjects = useMemo(
    () => normalizeProjects(recentQuery.data),
    [recentQuery.data],
  );
  const searchProjects = useMemo(
    () => normalizeProjects(searchQuery.data),
    [searchQuery.data],
  );
  const selectedProject = selectedQuery.data && getCoarseProjectId(selectedQuery.data) === selectedId
    ? selectedQuery.data
    : null;
  const options = useMemo(
    () => mergeProjects(selectedProject ? [selectedProject] : [], hasSearch ? searchProjects : [], recentProjects),
    [hasSearch, recentProjects, searchProjects, selectedProject],
  );

  return {
    hasSearch,
    options,
    selectedProject,
    isFetching: recentQuery.isFetching || searchQuery.isFetching || selectedQuery.isFetching,
  };
}
