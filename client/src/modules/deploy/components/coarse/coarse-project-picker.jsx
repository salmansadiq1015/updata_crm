'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, FolderKanban, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { getCoarseProjectId, useCoarseProjectOptions } from '../../hooks/use-coarse-project-options';

export function getProjectTitle(project) {
  if (!project) return '';
  return [project.projectNumber, project.name].filter(Boolean).join(' - ') || getCoarseProjectId(project);
}

export function getProjectMeta(project, fallback) {
  if (!project) return fallback;
  return (
    project.customerName
    || project.customerId?.name
    || project.customerId?.customerNumber
    || project.status
    || fallback
  );
}

/**
 * Project picker shared by the coarse single-week and multi-week dialogs:
 * search by project name/number, with recent-project suggestions shown as soon
 * as the popover opens (no typing required). Emits the selected project id via
 * onChange, so callers keep their plain id state — nothing else changes.
 */
export function CoarseProjectPicker({ value, defaultProjectId, onChange, disabled }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedId = value || defaultProjectId || '';
  const { hasSearch, options, selectedProject, isFetching } = useCoarseProjectOptions({
    open,
    search,
    selectedId,
  });
  const selected = options.find((project) => getCoarseProjectId(project) === value) || selectedProject;

  const selectProject = (project) => {
    onChange(getCoarseProjectId(project));
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-12 w-full justify-between rounded-xl border-border/70 bg-background/70 px-3.5 py-2.5 text-left font-normal shadow-sm',
            'hover:border-primary/40 hover:bg-muted/40',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderKanban className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate text-sm font-semibold', !selected && 'text-muted-foreground')}>
                {selected
                  ? getProjectTitle(selected)
                  : selectedId || t('deploy.coarse.selectProject', 'Projekt wählen')}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {selected
                  ? getProjectMeta(selected, t('deploy.coarse.selectedProject', 'Ausgewähltes Projekt'))
                  : selectedId
                    ? t('deploy.coarse.loadingProjects', 'Projekte werden geladen...')
                  : t('deploy.coarse.typeToSearchProjects', 'Mind. 2 Zeichen eingeben, um Projekte zu suchen.')}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl border-border/70 bg-popover p-0 shadow-xl"
      >
        <div className="border-b border-border/70 bg-muted/20 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('deploy.coarse.searchProjects', 'Projekte suchen...')}
              className="h-10 rounded-xl bg-background pl-9 text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto overscroll-contain p-2">
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {hasSearch
              ? t('deploy.coarse.searchResults', 'Suchergebnisse')
              : t('deploy.coarse.recentProjects', 'Aktuelle Projekte')}
          </div>

          {options.map((project) => {
            const id = getCoarseProjectId(project);
            const isSelected = id === value;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectProject(project)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
                  'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
                  isSelected && 'bg-primary/10',
                )}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {getProjectTitle(project)}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {getProjectMeta(project, t('deploy.coarse.project', 'Projekt'))}
                    </span>
                    {project.projectNumber && (
                      <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
                        {project.projectNumber}
                      </Badge>
                    )}
                  </span>
                </span>
                <span className={cn(
                  'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                  isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}

          {isFetching && options.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('deploy.coarse.loadingProjects', 'Projekte werden geladen...')}
            </div>
          )}

          {!isFetching && options.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-foreground">
                {t('deploy.coarse.noProjects', 'Keine Projekte gefunden')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('deploy.coarse.typeToSearchProjects', 'Mind. 2 Zeichen eingeben, um Projekte zu suchen.')}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
