'use client';

import { Inbox, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

type TaskEmptyStateProps = {
  type: 'empty' | 'filtered' | 'error' | 'offline';
  onReset?: () => void;
  onRetry?: () => void;
};

export function TaskEmptyState({ type, onReset, onRetry }: TaskEmptyStateProps) {
  const { t } = useLanguage();
  const isError = type === 'error' || type === 'offline';
  const Icon = type === 'offline' ? WifiOff : Inbox;
  const title = {
    empty: t('tasks.empty.title', 'Noch keine Aufgaben'),
    filtered: t('tasks.empty.filteredTitle', 'Keine Aufgaben für diese Ansicht'),
    error: t('tasks.empty.errorTitle', 'Aufgaben konnten nicht geladen werden'),
    offline: t('tasks.empty.offlineTitle', 'Sie sind offline'),
  }[type];
  const body = {
    empty: t('tasks.empty.body', 'Erstellen Sie eine Aufgabe, um diesen Arbeitsbereich zu starten.'),
    filtered: t('tasks.empty.filteredBody', 'Passen Sie Suche oder Filter an, um mehr Aufgaben zu sehen.'),
    error: t('tasks.empty.errorBody', 'Die aktuelle Ansicht bleibt nach Möglichkeit aus dem Cache verfügbar.'),
    offline: t('tasks.empty.offlineBody', 'Zwischengespeicherte Aufgaben bleiben nutzbar. Änderungen synchronisieren nach der Wiederverbindung.'),
  }[type];

  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface">
        <Icon className={isError ? 'h-5 w-5 text-warning' : 'h-5 w-5 text-primary'} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {type === 'filtered' && onReset ? (
        <Button type="button" variant="outline" size="sm" className="" onClick={onReset}>
          {t('tasks.clearFilters', 'Filter löschen')}
        </Button>
      ) : null}
      {isError && onRetry ? (
        <Button type="button" variant="outline" size="sm" className="" onClick={onRetry}>
          {t('common.retry', 'Erneut versuchen')}
        </Button>
      ) : null}
    </div>
  );
}
