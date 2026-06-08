'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectService } from '@/modules/pm/services/project-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search, Check, FolderKanban, LayoutTemplate } from 'lucide-react';

/**
 * Create-from-Template flow (PROJ-001 AF-1 / AC-4).
 * A template is an existing project; the server clones its schedule + prep actions.
 * The user picks a source project, optionally overrides the name and planned start
 * (which shifts the cloned schedule), then submits to the from-template endpoint.
 */
export function CreateFromTemplateDialog({ open, onOpenChange, onSubmit, isLoading }) {
  const { t, language } = useLanguage();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [plannedStartDate, setPlannedStartDate] = useState('');

  const debouncedSearch = useDebounce(search, 300);

  const { data: results = [], isFetching } = useQuery({
    queryKey: queryKeys.pm.projects.search(debouncedSearch),
    queryFn: () => projectService.searchProjects(debouncedSearch, 20),
    enabled: debouncedSearch.trim().length >= 2,
  });

  const reset = () => {
    setSearch('');
    setSelected(null);
    setName('');
    setPlannedStartDate('');
  };

  const handleOpenChange = (next) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const canSubmit = !!selected && !isLoading;

  const handleCreate = () => {
    if (!selected) return;
    const payload = { templateId: selected._id };
    if (name.trim()) payload.name = name.trim();
    if (plannedStartDate) payload.plannedStartDate = new Date(plannedStartDate).toISOString();
    onSubmit(payload);
  };

  const placeholder = useMemo(
    () => (language === 'de' ? 'Vorlagenprojekt suchen…' : 'Search template projects…'),
    [language],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <LayoutTemplate className="h-4 w-4 text-primary" />
            </div>
            {t('pm.createFromTemplate', 'Create from Template')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template picker */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('pm.templateProject', 'Template Project')}
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
                placeholder={placeholder}
                className="pl-8"
                aria-label={placeholder}
              />
            </div>

            {debouncedSearch.trim().length >= 2 && (
              <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                {isFetching && results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {language === 'de' ? 'Suche…' : 'Searching…'}
                  </p>
                )}
                {!isFetching && results.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {language === 'de' ? 'Keine Projekte gefunden' : 'No projects found'}
                  </p>
                )}
                {results.map((p) => {
                  const isSel = selected?._id === p._id;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => { setSelected(p); if (!name) setName(`${p.name} (Copy)`); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors',
                        isSel && 'bg-primary/5',
                      )}
                    >
                      <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{p.name}</span>
                        {p.projectNumber && (
                          <span className="block text-[10px] font-mono text-muted-foreground">{p.projectNumber}</span>
                        )}
                      </span>
                      {isSel && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Overrides */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('pm.projectName', 'Project Name')}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selected ? `${selected.name} (Copy)` : ''}
              disabled={!selected}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('pm.plannedStart', 'Planned Start Date')}
            </Label>
            <Input
              type="date"
              value={plannedStartDate}
              onChange={(e) => setPlannedStartDate(e.target.value)}
              disabled={!selected}
            />
            <p className="text-[11px] text-muted-foreground">
              {language === 'de'
                ? 'Verschiebt den kopierten Bauzeitplan entsprechend.'
                : 'Shifts the copied construction schedule accordingly.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {isLoading
              ? (language === 'de' ? 'Erstellt…' : 'Creating…')
              : t('pm.createFromTemplate', 'Create from Template')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
