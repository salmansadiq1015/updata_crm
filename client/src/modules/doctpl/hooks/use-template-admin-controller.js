'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useCIAudit } from './useCIQueries';
import { useTemplates } from './useTemplateQueries';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useUpdateTemplate,
} from './useTemplateMutations';
import {
  TEMPLATE_ADMIN_DEFAULT_SORT,
  TEMPLATE_ADMIN_DEFAULT_VIEW,
} from '../constants/template-admin';
import {
  buildTemplateFilters,
  buildTemplateStats,
  buildTemplateTypeOptions,
  hasTemplateAdminFilters,
  normalizeTemplatePage,
} from '../utils/template-admin-utils';

export function useTemplateAdminController() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState(TEMPLATE_ADMIN_DEFAULT_SORT);
  const [viewMode, setViewMode] = useState(TEMPLATE_ADMIN_DEFAULT_VIEW);
  const [cursorStack, setCursorStack] = useState([]);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const canWrite = hasPermission('templates:write');
  const canDelete = hasPermission('templates:delete');
  const canAdmin = hasPermission('templates:admin');
  const activeCursor = cursorStack[cursorStack.length - 1] || undefined;
  const debouncedSearch = useDebounce(search, 300).trim();

  const queryFilters = useMemo(() => buildTemplateFilters({
    cursor: activeCursor,
    search: debouncedSearch,
    typeFilter,
    statusFilter,
    sortValue,
  }), [activeCursor, debouncedSearch, sortValue, statusFilter, typeFilter]);

  const templatesQuery = useTemplates(queryFilters);
  const ciAuditQuery = useCIAudit({ enabled: canAdmin });
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const duplicate = useDuplicateTemplate();
  const remove = useDeleteTemplate();

  const { templates, pagination } = normalizeTemplatePage(templatesQuery.data);
  const typeOptions = useMemo(() => buildTemplateTypeOptions(templates), [templates]);
  const stats = useMemo(
    () => buildTemplateStats(templates, ciAuditQuery.data?.summary),
    [ciAuditQuery.data?.summary, templates],
  );
  const hasActiveFilters = hasTemplateAdminFilters({ search, typeFilter, statusFilter });
  const isBusy = create.isPending || update.isPending || duplicate.isPending || remove.isPending;

  const resetPaging = useCallback(() => {
    setCursorStack([]);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setSortValue(TEMPLATE_ADMIN_DEFAULT_SORT);
    resetPaging();
  }, [resetPaging]);

  const refresh = useCallback(() => {
    templatesQuery.refetch();
    if (canAdmin) ciAuditQuery.refetch();
  }, [canAdmin, ciAuditQuery, templatesQuery]);

  const createTemplate = useCallback(async (payload) => {
    if (!canWrite) return;
    try {
      const response = await create.mutateAsync(payload);
      const created = response?.data || response;
      showSuccess(t('doctpl.templates.created'));
      setCreateOpen(false);
      resetPaging();
      if (created?._id) router.push(`/admin/templates/${created._id}`);
    } catch (error) {
      showError(error);
    }
  }, [canWrite, create, resetPaging, router, t]);

  const duplicateTemplate = useCallback(async (template) => {
    if (!canWrite || !template?._id) return;
    try {
      await duplicate.mutateAsync({ id: template._id });
      showSuccess(t('doctpl.templates.duplicated'));
      resetPaging();
    } catch (error) {
      showError(error);
    }
  }, [canWrite, duplicate, resetPaging, t]);

  const toggleActive = useCallback(async (template) => {
    if (!canWrite || !template?._id) return;
    const nextActive = !template.isActive;
    try {
      await update.mutateAsync({
        id: template._id,
        isActive: nextActive,
        expectedVersion: template.currentVersion,
        changeDescription: nextActive
          ? t('doctpl.templates.activated')
          : t('doctpl.templates.deactivated'),
      });
      showSuccess(nextActive ? t('doctpl.templates.activated') : t('doctpl.templates.deactivated'));
    } catch (error) {
      showError(error);
    }
  }, [canWrite, t, update]);

  const deleteTemplate = useCallback(async () => {
    if (!canDelete || !templateToDelete?._id) return;
    try {
      await remove.mutateAsync({ id: templateToDelete._id });
      showSuccess(t('doctpl.templates.deleted'));
      setTemplateToDelete(null);
      resetPaging();
    } catch (error) {
      showError(error);
    }
  }, [canDelete, remove, resetPaging, t, templateToDelete]);

  return {
    t,
    locale,
    filters: {
      search,
      typeFilter,
      statusFilter,
      sortValue,
      viewMode,
      setSearch: (value) => {
        setSearch(value);
        resetPaging();
      },
      setTypeFilter: (value) => {
        setTypeFilter(value);
        resetPaging();
      },
      setStatusFilter: (value) => {
        setStatusFilter(value);
        resetPaging();
      },
      setSortValue: (value) => {
        setSortValue(value);
        resetPaging();
      },
      setViewMode,
      clearFilters,
      hasActiveFilters,
    },
    permissions: {
      canWrite,
      canDelete,
      canAdmin,
    },
    data: {
      templates,
      pagination,
      typeOptions,
      stats,
      auditTemplates: ciAuditQuery.data?.templates || [],
      ciAudit: ciAuditQuery.data,
    },
    state: {
      isLoading: templatesQuery.isLoading,
      isFetching: templatesQuery.isFetching || ciAuditQuery.isFetching,
      isError: templatesQuery.isError,
      isBusy,
      cursorStack,
      createOpen,
      templateToDelete,
      ciAuditLoading: ciAuditQuery.isLoading,
      ciAuditError: ciAuditQuery.isError,
    },
    actions: {
      refresh,
      createTemplate,
      duplicateTemplate,
      toggleActive,
      deleteTemplate,
      setCreateOpen,
      setTemplateToDelete,
      previousPage: () => setCursorStack((stack) => stack.slice(0, -1)),
      nextPage: () => {
        if (pagination?.hasNext && pagination?.nextCursor) {
          setCursorStack((stack) => [...stack, pagination.nextCursor]);
        }
      },
    },
  };
}
