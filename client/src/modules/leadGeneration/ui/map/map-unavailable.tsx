'use client';

import { MapPinOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

type MapUnavailableVariant = 'no-key' | 'error';

interface MapUnavailableProps {
  variant: MapUnavailableVariant;
  className?: string;
}

/**
 * Graceful fallback shown when the browser Maps key is missing or the SDK fails
 * to load. The wizard remains fully usable without the map. Uses semantic tokens
 * only, and logical spacing so it mirrors correctly in RTL.
 */
export function MapUnavailable({ variant, className }: MapUnavailableProps) {
  const { t } = useLanguage();

  const title =
    variant === 'no-key'
      ? t('leadgen.map.unavailableTitle', 'Map unavailable')
      : t('leadgen.map.errorTitle', 'Map failed to load');

  const detail =
    variant === 'no-key'
      ? t(
          'leadgen.map.missingKey',
          'Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY',
        )
      : t(
          'leadgen.map.loadError',
          'The map could not be loaded. Check the Maps browser key, billing, and your network connection.',
        );

  return (
    <div
      role="status"
      data-testid="discovery-map-unavailable"
      data-variant={variant}
      className={cn(
        'flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3',
        'rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapPinOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** Lightweight skeleton while the map chunk / SDK is loading. */
export function MapLoading({ className }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div
      role="status"
      data-testid="discovery-map-loading"
      aria-busy="true"
      className={cn(
        'flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3',
        'rounded-xl border border-border bg-muted/30 p-6 text-center',
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        {t('leadgen.map.loading', 'Loading map…')}
      </p>
    </div>
  );
}
