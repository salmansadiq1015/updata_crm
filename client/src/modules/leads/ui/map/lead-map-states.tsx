'use client';

import { Loader2, MapPinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '../lead-ui-kit';

/** Lightweight skeleton while the map chunk / Leaflet loads. */
export function LeadMapLoading({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      data-testid="leads-map-loading"
      aria-busy="true"
      className={cn(
        'flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3 bg-muted/30 p-6 text-center',
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">{t('leads.map.loading', 'Loading map…')}</p>
    </div>
  );
}

/** Shown when Leaflet fails to initialise/render — the rest of the overlay stays usable. */
export function LeadMapUnavailable({ className }: { className?: string; variant?: 'error' }) {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      data-testid="leads-map-unavailable"
      className={cn(
        'flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3 bg-muted/40 p-6 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapPinOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('leads.map.errorTitle', 'Map failed to load')}</p>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">
          {t('leads.map.errorBody', 'The map could not be displayed. Your leads are still available in the list.')}
        </p>
      </div>
    </div>
  );
}
