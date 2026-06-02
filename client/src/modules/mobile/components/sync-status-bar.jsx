'use client';

import { WifiOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { useSyncStore } from '../stores/sync-store';
import { useNetworkStatus } from '../hooks/use-network-status';
import { triggerSync } from '../lib/sync-engine';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

export function SyncStatusBar() {
  const online = useNetworkStatus();
  const { t } = useLanguage();
  const { syncStatus, pendingCount, failedCount, conflictCount, progress } =
    useSyncStore();

  if (online && syncStatus === 'idle' && pendingCount === 0 && conflictCount === 0) return null;

  const config = getBarConfig(online, syncStatus, pendingCount, failedCount, conflictCount, t);

  return (
    <div
      className={cn(
        'flex items-center justify-between px-4 py-2 text-sm font-medium',
        'safe-area-inset-top',
        config.className
      )}
    >
      <div className="flex items-center gap-2">
        <config.Icon className="h-4 w-4 shrink-0" />
        <span>{config.message}</span>
        {progress && syncStatus === 'syncing' && (
          <span className="text-xs opacity-75">
            ({progress.current}/{progress.total})
          </span>
        )}
      </div>

      {config.showRetry && (
        <button
          onClick={() => triggerSync()}
          className="text-xs underline underline-offset-2 hover:opacity-80"
          aria-label={t('mobile.sync.retry', 'Erneut versuchen')}
        >
          {t('mobile.sync.retry', 'Erneut versuchen')}
        </button>
      )}
    </div>
  );
}

function getBarConfig(online, syncStatus, pendingCount, failedCount, conflictCount, t) {
  if (!online) {
    return {
      Icon: WifiOff,
      message: t('mobile.sync.offline', 'Offline — Änderungen werden lokal gespeichert'),
      className: 'bg-amber-500/90 text-white',
      showRetry: false,
    };
  }

  if (syncStatus === 'syncing') {
    return {
      Icon: RefreshCw,
      message: t('mobile.sync.syncing', 'Synchronisiere...'),
      className: 'bg-blue-500/90 text-white',
      showRetry: false,
    };
  }

  if (conflictCount > 0) {
    return {
      Icon: AlertTriangle,
      message: t('mobile.sync.conflictCount', `${conflictCount} Konflikt(e) — bitte Anlage erneut öffnen und lösen`).replace('{count}', conflictCount),
      className: 'bg-red-500/90 text-white',
      showRetry: false,
    };
  }

  if (syncStatus === 'error' || failedCount > 0) {
    return {
      Icon: AlertTriangle,
      message: t('mobile.sync.failedCount', `Sync fehlgeschlagen (${failedCount} Einträge)`).replace('{count}', failedCount),
      className: 'bg-red-500/90 text-white',
      showRetry: true,
    };
  }

  if (pendingCount > 0) {
    return {
      Icon: RefreshCw,
      message: t('mobile.sync.pendingCount', `${pendingCount} Änderungen warten auf Sync`).replace('{count}', pendingCount),
      className: 'bg-amber-500/90 text-white',
      showRetry: true,
    };
  }

  return {
    Icon: Check,
    message: t('mobile.sync.synced', 'Synchronisiert'),
    className: 'bg-green-500/90 text-white',
    showRetry: false,
  };
}
