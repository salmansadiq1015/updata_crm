'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  MoreHorizontal,
  Pencil,
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
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CreateTemplateDialog } from './CreateTemplateDialog';
import { useTemplateAdminController } from '../hooks/use-template-admin-controller';
import {
  TEMPLATE_ADMIN_STATS,
  TEMPLATE_CI_STATUS_META,
  TEMPLATE_SORT_OPTIONS,
  TEMPLATE_STATUS_OPTIONS,
  TEMPLATE_VIEW_OPTIONS,
} from '../constants/template-admin';
import {
  countTableColumns,
  countVisibleSections,
  formatTemplateDate,
  getTemplateAuditStatus,
  getTemplateDisplayVersion,
} from '../utils/template-admin-utils';

function IconButton({ label, icon: Icon, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} size="icon-sm" variant="ghost" {...props}>
          {Icon ? <Icon className="h-4 w-4" /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CiStatusBadge({ status, t }) {
  const meta = TEMPLATE_CI_STATUS_META[status] || TEMPLATE_CI_STATUS_META.unknown;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('gap-1.5 rounded-md px-2 py-1 text-xs', meta.badgeClassName)}>
      <Icon className="h-3.5 w-3.5" />
      {t(meta.labelKey)}
    </Badge>
  );
}

function TemplateStatusBadge({ template, t }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md px-2 py-1 text-xs',
        template.isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-border bg-muted/60 text-muted-foreground',
      )}
    >
      {template.isActive ? t('doctpl.templates.active') : t('doctpl.templates.inactive')}
    </Badge>
  );
}

function HeaderActions({ canWrite, onCreate, t }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canWrite && (
        <Button className="gap-2 shadow-sm" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          {t('doctpl.templates.create')}
        </Button>
      )}
      <Button asChild variant="outline" className="gap-2 bg-background/80">
        <Link href="/admin/templates/ci">
          <Settings2 className="h-4 w-4" />
          {t('doctpl.templates.ciConfiguration')}
        </Link>
      </Button>
    </div>
  );
}

function TemplateStats({ stats, t }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {TEMPLATE_ADMIN_STATS.map((item) => {
        const Icon = item.icon;
        const value = stats[item.valueKey] ?? 0;
        return (
          <Card key={item.id} className="rounded-lg bg-card/95 shadow-sm">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">{t(item.labelKey)}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {value}{item.suffix || ''}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/70">
                  <Icon className={cn('h-4 w-4', item.className)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t(item.descriptionKey)}</p>
              {item.id === 'ci' && (
                <Progress value={value} className="h-1.5" aria-label={t('doctpl.templates.statCi')} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function FiltersToolbar({ controller }) {
  const { t, filters, data, state, actions } = controller;
  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('doctpl.templates.toolbarTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('doctpl.templates.toolbarDescription')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-muted/40 p-1">
              {TEMPLATE_VIEW_OPTIONS.map(([value, labelKey, Icon]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filters.viewMode === value ? 'secondary' : 'ghost'}
                  className="h-7 gap-1.5 rounded-md px-2"
                  onClick={() => filters.setViewMode(value)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey)}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={actions.refresh}
              disabled={state.isFetching}
              aria-label={t('doctpl.templates.refresh')}
              title={t('doctpl.templates.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', state.isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_220px_180px_180px_auto] xl:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('doctpl.templates.search')}
              value={filters.search}
              onChange={(event) => filters.setSearch(event.target.value)}
              placeholder={t('doctpl.templates.searchPlaceholder')}
              className="h-10 pl-9"
            />
          </div>
          <Select value={filters.typeFilter} onValueChange={filters.setTypeFilter}>
            <SelectTrigger className="h-10" aria-label={t('doctpl.templates.typeLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.typeOptions.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key, value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.statusFilter} onValueChange={filters.setStatusFilter}>
            <SelectTrigger className="h-10" aria-label={t('doctpl.templates.statusLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_STATUS_OPTIONS.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.sortValue} onValueChange={filters.setSortValue}>
            <SelectTrigger className="h-10" aria-label={t('doctpl.templates.sortLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_SORT_OPTIONS.map(([value, key]) => (
                <SelectItem key={value} value={value}>{t(key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-10"
            onClick={filters.clearFilters}
            disabled={!filters.hasActiveFilters}
          >
            {t('doctpl.templates.clearFilters')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateActions({ template, controller }) {
  const { t, permissions, state, actions } = controller;
  const isReadOnly = !permissions.canWrite && !permissions.canDelete;
  return (
    <div className="flex items-center gap-1.5">
      <Button asChild size="sm" variant="outline" className="min-w-24 gap-1.5">
        <Link href={`/admin/templates/${template._id}`}>
          <Pencil className="h-3.5 w-3.5" />
          {t('doctpl.templates.openEditor')}
        </Link>
      </Button>
      {permissions.canWrite && (
        <>
          <IconButton
            label={t('doctpl.templates.duplicateTemplate')}
            icon={Copy}
            onClick={() => actions.duplicateTemplate(template)}
            disabled={state.isBusy}
          />
          <IconButton
            label={template.isActive ? t('doctpl.templates.deactivateTemplate') : t('doctpl.templates.activateTemplate')}
            onClick={() => actions.toggleActive(template)}
            disabled={state.isBusy}
          >
            {template.isActive
              ? <ToggleRight className="h-4 w-4 text-emerald-600" />
              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
          </IconButton>
        </>
      )}
      {permissions.canDelete && (
        <IconButton
          label={t('doctpl.templates.archiveTemplate')}
          icon={Trash2}
          onClick={() => actions.setTemplateToDelete(template)}
          disabled={state.isBusy}
          className="text-destructive hover:text-destructive"
        />
      )}
      {isReadOnly && (
        <Badge variant="outline" className="rounded-md text-xs">{t('doctpl.templates.readOnly')}</Badge>
      )}
    </div>
  );
}

function TemplateCard({ template, controller }) {
  const { t, locale, data } = controller;
  const ciStatus = getTemplateAuditStatus(template, data.auditTemplates);
  return (
    <Card className="group rounded-lg shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">{template.name}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`doctpl.type.${template.templateType}`, template.templateType)}
                </p>
              </div>
            </div>
          </div>
          <TemplateStatusBadge template={template} t={t} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground">{t('doctpl.templates.version')}</p>
            <p className="mt-1 font-semibold text-foreground">{getTemplateDisplayVersion(template)}</p>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground">{t('doctpl.templates.updated')}</p>
            <p className="mt-1 font-semibold text-foreground">{formatTemplateDate(template.updatedAt, locale)}</p>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground">{t('doctpl.templates.sections')}</p>
            <p className="mt-1 font-semibold text-foreground">{countVisibleSections(template)}</p>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground">{t('doctpl.templates.columns')}</p>
            <p className="mt-1 font-semibold text-foreground">{countTableColumns(template)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CiStatusBadge status={ciStatus} t={t} />
          {template.approvalStatus && (
            <Badge variant="outline" className="rounded-md text-xs">
              {t(`doctpl.approval.${template.approvalStatus}`, template.approvalStatus)}
            </Badge>
          )}
        </div>

        <div className="mt-auto border-t pt-4">
          <TemplateActions template={template} controller={controller} />
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateCards({ controller }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {controller.data.templates.map((template) => (
        <TemplateCard key={template._id} template={template} controller={controller} />
      ))}
    </div>
  );
}

function TemplateTable({ controller }) {
  const { t, locale, data } = controller;
  return (
    <Card className="overflow-hidden rounded-lg shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="px-4">{t('doctpl.templates.tableTemplate')}</TableHead>
            <TableHead>{t('doctpl.templates.tableType')}</TableHead>
            <TableHead>{t('doctpl.templates.tableStatus')}</TableHead>
            <TableHead>{t('doctpl.templates.tableVersion')}</TableHead>
            <TableHead>{t('doctpl.templates.tableUpdated')}</TableHead>
            <TableHead>{t('doctpl.templates.tableCi')}</TableHead>
            <TableHead className="text-right">{t('doctpl.templates.tableActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.templates.map((template) => {
            const ciStatus = getTemplateAuditStatus(template, data.auditTemplates);
            return (
              <TableRow key={template._id}>
                <TableCell className="max-w-[280px] px-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{template.name}</span>
                  </div>
                </TableCell>
                <TableCell>{t(`doctpl.type.${template.templateType}`, template.templateType)}</TableCell>
                <TableCell><TemplateStatusBadge template={template} t={t} /></TableCell>
                <TableCell>{getTemplateDisplayVersion(template)}</TableCell>
                <TableCell>{formatTemplateDate(template.updatedAt, locale)}</TableCell>
                <TableCell><CiStatusBadge status={ciStatus} t={t} /></TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <TemplateActions template={template} controller={controller} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-28 rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function TemplatesEmptyState({ controller }) {
  const { t, filters, permissions, actions } = controller;
  const filtered = filters.hasActiveFilters;
  return (
    <Card className="rounded-lg border-dashed shadow-sm">
      <EmptyState
        icon={filtered ? Search : FileText}
        title={filtered ? t('doctpl.templates.noResultsTitle') : t('doctpl.templates.emptyTitle')}
        description={filtered ? t('doctpl.templates.noResultsDescription') : t('doctpl.templates.emptyDescription')}
        action={(
          <div className="flex flex-wrap justify-center gap-2">
            {filtered && (
              <Button variant="outline" size="sm" onClick={filters.clearFilters}>
                {t('doctpl.templates.clearFilters')}
              </Button>
            )}
            {permissions.canWrite && !filtered && (
              <Button size="sm" className="gap-2" onClick={() => actions.setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('doctpl.templates.createFirst')}
              </Button>
            )}
          </div>
        )}
      />
    </Card>
  );
}

function ContentState({ controller }) {
  const { t, state, filters, data, actions } = controller;
  if (state.isLoading) return <LoadingState />;

  if (state.isError) {
    return (
      <Card className="rounded-lg border-destructive/30 bg-destructive/5 shadow-sm">
        <EmptyState
          icon={FileText}
          title={t('doctpl.templates.loadFailed')}
          description={t('doctpl.templates.retryLoad')}
          action={(
            <Button variant="outline" size="sm" className="gap-2" onClick={actions.refresh}>
              <RefreshCw className="h-4 w-4" />
              {t('common.retry', 'Retry')}
            </Button>
          )}
        />
      </Card>
    );
  }

  if (!data.templates.length) return <TemplatesEmptyState controller={controller} />;

  return filters.viewMode === 'table'
    ? <TemplateTable controller={controller} />
    : <TemplateCards controller={controller} />;
}

function PaginationFooter({ controller }) {
  const { t, data, state, actions } = controller;
  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {state.isFetching && !state.isLoading
          ? t('doctpl.templates.refreshing')
          : t('doctpl.templates.pageCount', null, { count: data.templates.length })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={state.cursorStack.length === 0}
          onClick={actions.previousPage}
        >
          <ChevronLeft className="h-4 w-4" />
          {t('common.previous', 'Previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!data.pagination.hasNext || !data.pagination.nextCursor}
          onClick={actions.nextPage}
        >
          {t('common.next', 'Next')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function TemplateAdminPage() {
  const controller = useTemplateAdminController();
  const { t, data, permissions, state, actions } = controller;

  return (
    <TooltipProvider>
      <div className="min-h-full bg-[linear-gradient(180deg,hsl(var(--muted)/0.45),transparent_360px)]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-6">
          <div className="grid gap-5 border-b pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-3 rounded-md bg-background/70 px-2 py-1 text-xs">
                {t('doctpl.templates.kicker')}
              </Badge>
              <h1 className="text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
                {t('doctpl.templates.title')}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {t('doctpl.templates.summary')}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2.5 py-1">
                  <FileText className="h-3.5 w-3.5" />
                  {t('doctpl.templates.activeRatio', null, { count: data.stats.active })}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-background/70 px-2.5 py-1">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  {t('doctpl.templates.issueCount', null, { count: data.stats.issueCount })}
                </span>
              </div>
            </div>
            <HeaderActions
              canWrite={permissions.canWrite}
              onCreate={() => actions.setCreateOpen(true)}
              t={t}
            />
          </div>

          {state.isLoading ? (
            <LoadingState />
          ) : (
            <>
              <TemplateStats stats={data.stats} t={t} />
              <FiltersToolbar controller={controller} />
              <ContentState controller={controller} />
              <PaginationFooter controller={controller} />
            </>
          )}
        </div>

        <AlertDialog open={!!state.templateToDelete} onOpenChange={(open) => !open && actions.setTemplateToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('doctpl.templates.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('doctpl.templates.deleteDescription')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={state.isBusy}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={actions.deleteTemplate} disabled={state.isBusy}>
                {t('doctpl.templates.deleteConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {state.createOpen && (
          <CreateTemplateDialog
            open={state.createOpen}
            onOpenChange={actions.setCreateOpen}
            onSubmit={actions.createTemplate}
            isSubmitting={state.isBusy}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
