'use client';

import { useState } from 'react';
import { BriefcaseBusiness, ClipboardList, Link2Off, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useTaskContextSearch } from '../hooks/use-task-context-search';
import type { Task, TaskContextOption } from '../types/task-types';

type TaskContextSelectorProps = {
  task: Task;
  onSelect: (option: TaskContextOption) => void;
  onClear: () => void;
};

export function TaskContextSelector({ task, onSelect, onClear }: TaskContextSelectorProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const search = useTaskContextSearch(query);
  const linkedType = task.projectId
    ? t('tasks.context.project', 'Projekt')
    : task.orderId
    ? t('tasks.context.order', 'Einsatz')
    : null;
  const linkedId = task.projectId ?? task.orderId;
  // Prefer the linked record's name — never show a raw object id.
  const linkedLabel = (task.projectId ? task.projectName : task.orderName) ?? null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('tasks.context.title', 'Kontext')}
        </h4>
        {linkedId ? (
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {linkedId ? (
        <div className="rounded-md border border-border bg-background px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{linkedType}</div>
          <div className="truncate text-xs font-medium">{linkedLabel || linkedType}</div>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('tasks.context.searchPlaceholder', 'Projekt oder Einsatz suchen')}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {query.trim().length >= 2 ? (
        <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background">
          {search.isLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (search.data ?? []).length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{t('tasks.context.noMatches', 'Keine Treffer')}</div>
          ) : (
            (search.data ?? []).map((option) => {
              const Icon = option.type === 'project' ? BriefcaseBusiness : ClipboardList;
              return (
                <button
                  key={`${option.type}:${option.id}`}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/50',
                    linkedId === option.id && 'bg-primary/5',
                  )}
                  onClick={() => {
                    onSelect(option);
                    setQuery('');
                  }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs">{option.label}</span>
                  {option.status ? <span className="text-[10px] uppercase text-muted-foreground">{option.status}</span> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
