'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { PageHeader } from '@/shared/components/page-header';
import { CreateTemplateDialog } from '@/modules/doctpl/components/CreateTemplateDialog';
import { useTemplates } from '@/modules/doctpl/hooks/useTemplateQueries';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useDuplicateTemplate,
  useUpdateTemplate,
} from '@/modules/doctpl/hooks/useTemplateMutations';
import { BUILT_IN_TEMPLATE_TYPES } from '@/modules/doctpl/utils/template-defaults';

const TEMPLATE_TYPES = [
  ['all', 'doctpl.templates.allTypes'],
  ...BUILT_IN_TEMPLATE_TYPES,
];

const STATUS_OPTIONS = [
  ['all', 'doctpl.templates.allStatuses'],
  ['active', 'doctpl.templates.active'],
  ['inactive', 'doctpl.templates.inactive'],
];

const SORT_OPTIONS = [
  ['createdAt:desc', 'doctpl.templates.newestFirst'],
  ['createdAt:asc', 'doctpl.templates.oldestFirst'],
  ['name:asc', 'doctpl.templates.nameAsc'],
  ['templateType:asc', 'doctpl.templates.typeAsc'],
];
const EMPTY_TEMPLATES = [];

export function buildTemplateFilters({
  cursor,
  search,
  typeFilter,
  statusFilter,
  sortValue,
}) {
  const [sortBy, sortOrder] = String(sortValue || 'createdAt:desc').split(':');
  return {
    limit: 24,
    sortBy,
    sortOrder,
    ...(cursor ? { cursor } : {}),
    ...(typeFilter && typeFilter !== 'all' ? { templateType: typeFilter } : {}),
    ...(statusFilter === 'active' ? { isActive: true } : {}),
    ...(statusFilter === 'inactive' ? { isActive: false } : {}),
    ...(search?.trim() ? { search: search.trim() } : {}),
  };
}

export default function AdminTemplatesPage() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('createdAt:desc');
  const [cursorStack, setCursorStack] = useState([]);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const activeCursor = cursorStack[cursorStack.length - 1] || undefined;

  const filters = useMemo(() => buildTemplateFilters({
    cursor: activeCursor,
    search,
    typeFilter,
    statusFilter,
    sortValue,
  }), [activeCursor, search, typeFilter, statusFilter, sortValue]);

  const { data, isLoading, isFetching, isError, refetch } = useTemplates(filters);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const duplicate = useDuplicateTemplate();
  const remove = useDeleteTemplate();
  const templates = data?.items ?? EMPTY_TEMPLATES;
  const pagination = data?.pagination ?? {};
  const dateLocale = locale === 'de' ? 'de-CH' : 'en-CH';
  const busy = create.isPending || update.isPending || duplicate.isPending || remove.isPending;
  const templateTypeOptions = useMemo(() => {
    const known = new Map(TEMPLATE_TYPES);
    for (const template of templates) {
      if (template?.templateType && !known.has(template.templateType)) {
        known.set(template.templateType, `doctpl.type.${template.templateType}`);
      }
    }
    return [...known.entries()];
  }, [templates]);

  const resetPaging = () => {
    setCursorStack([]);
  };

  const toggleActive = async (template) => {
    try {
      await update.mutateAsync({
        id: template._id,
        isActive: !template.isActive,
        expectedVersion: template.currentVersion,
        changeDescription: template.isActive
          ? t('doctpl.templates.deactivated')
          : t('doctpl.templates.activated'),
      });
      showSuccess(template.isActive ? t('doctpl.templates.deactivated') : t('doctpl.templates.activated'));
    } catch (error) {
      showError(error);
    }
  };

  const duplicateTemplate = async (template) => {
    try {
      await duplicate.mutateAsync({ id: template._id });
      showSuccess(t('doctpl.templates.duplicated', 'Template duplicated'));
      resetPaging();
    } catch (error) {
      showError(error);
    }
  };

  const createTemplate = async (payload) => {
    try {
      const response = await create.mutateAsync(payload);
      const created = response?.data || response;
      showSuccess(t('doctpl.templates.created', 'Template created'));
      setCreateOpen(false);
      resetPaging();
      if (created?._id) router.push(`/admin/templates/${created._id}`);
    } catch (error) {
      showError(error);
    }
  };

  const deleteTemplate = async () => {
    if (!templateToDelete?._id) return;
    try {
      await remove.mutateAsync({ id: templateToDelete._id });
      showSuccess(t('doctpl.templates.deleted', 'Template archived'));
      setTemplateToDelete(null);
      resetPaging();
    } catch (error) {
      showError(error);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title={t('doctpl.templates.title')}
          description={t('doctpl.templates.description')}
        />
        <div className="flex shrink-0 gap-2">
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('doctpl.templates.create', 'Create template')}
          </Button>
          <Link href="/admin/templates/ci">
            <Button variant="outline" className="gap-2">
              <Settings2 className="h-4 w-4" />
              {t('doctpl.templates.ciConfiguration')}
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_220px_180px_180px]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('doctpl.templates.search', 'Search templates')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPaging();
              }}
              placeholder={t('doctpl.templates.searchPlaceholder', 'Search templates')}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(value) => { setTypeFilter(value); resetPaging(); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templateTypeOptions.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key, value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); resetPaging(); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key, value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortValue} onValueChange={(value) => { setSortValue(value); resetPaging(); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key, value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title={t('common.refresh', 'Refresh')}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">{t('doctpl.templates.loadFailed', 'Templates could not be loaded.')}</p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('doctpl.templates.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div
              key={template._id}
              className="flex min-h-44 flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{template.name}</span>
                </div>
                <Badge variant={template.isActive ? 'default' : 'secondary'} className="shrink-0">
                  {template.isActive ? t('doctpl.templates.active') : t('doctpl.templates.inactive')}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t(`doctpl.type.${template.templateType}`, template.templateType)}
                </p>
                <p className="text-xs text-muted-foreground">
                  v{template.currentVersion} - {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString(dateLocale) : '-'}
                </p>
              </div>

              <div className="mt-auto flex gap-2 border-t pt-3">
                <Link href={`/admin/templates/${template._id}`} className="min-w-0 flex-1">
                  <Button size="sm" variant="outline" className="w-full">
                    {t('doctpl.templates.edit')}
                  </Button>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={t('doctpl.templates.duplicate', 'Duplicate')}
                  onClick={() => duplicateTemplate(template)}
                  disabled={busy}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  title={template.isActive ? t('doctpl.templates.deactivate') : t('doctpl.templates.activate')}
                  onClick={() => toggleActive(template)}
                  disabled={busy}
                >
                  {template.isActive
                    ? <ToggleRight className="h-4 w-4 text-green-600" />
                    : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title={t('doctpl.templates.delete', 'Archive')}
                  onClick={() => setTemplateToDelete(template)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isFetching && !isLoading
            ? t('doctpl.templates.refreshing', 'Refreshing templates...')
            : t('doctpl.templates.pageCount', '{{count}} templates on this page').replace('{{count}}', templates.length)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={cursorStack.length === 0}
            onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('common.previous', 'Previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!pagination.hasNext || !pagination.nextCursor}
            onClick={() => setCursorStack((stack) => [...stack, pagination.nextCursor])}
          >
            {t('common.next', 'Next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('doctpl.templates.deleteTitle', 'Archive template')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('doctpl.templates.deleteDescription', 'This template will be removed from active management lists. Existing generated documents remain available.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTemplate} disabled={remove.isPending}>
              {t('doctpl.templates.deleteConfirm', 'Archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {createOpen && (
        <CreateTemplateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={createTemplate}
          isSubmitting={create.isPending}
        />
      )}
    </div>
  );
}
