'use client';

// Floating selection bar, shown while results are selected. "Add Selected (N)"
// runs the import for the chosen rows; "Add All New (X)" is always reachable for
// the full new-lead set. Both open the import preview dialog via callbacks.

import { Plus, Sparkles, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';

export function BulkActionBar({
  selectedCount,
  newCount,
  onAddSelected,
  onAddAllNew,
  onClear,
}: {
  selectedCount: number;
  newCount: number;
  onAddSelected: () => void;
  onAddAllNew: () => void;
  onClear: () => void;
}) {
  const { t } = useLanguage();
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label={t('leadgen.bulk.selectedCount', '{count} selected', { count: selectedCount })}
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-2xl animate-in slide-in-from-bottom-2"
    >
      <span className="whitespace-nowrap text-sm font-medium text-foreground">
        {t('leadgen.bulk.selectedCount', '{count} selected', { count: selectedCount })}
      </span>

      <div className="mx-1 h-5 w-px bg-border" />

      <Button size="sm" onClick={onAddSelected} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('leadgen.bulk.addSelected', 'Add selected')}
      </Button>

      {newCount > 0 && (
        <Button size="sm" variant="outline" onClick={onAddAllNew} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {`${t('leadgen.bulk.addAllNew', 'Add all new')} (${newCount})`}
        </Button>
      )}

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onClear}
        aria-label={t('leadgen.bulk.clearSelection', 'Clear selection')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
