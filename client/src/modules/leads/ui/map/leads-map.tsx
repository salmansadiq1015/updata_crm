'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '../lead-ui-kit';
import { LeadMapLoading } from './lead-map-states';
import type { LeadsMapCanvasProps } from './leads-map-canvas';

// Leaflet (and its CSS) needs `window`, so the canvas is pulled into the bundle —
// and executed — only on the client, never during the server render.
const LeadsMapCanvas = dynamic(() => import('./leads-map-canvas').then((m) => m.LeadsMapCanvas), {
  ssr: false,
  loading: () => <LeadMapLoading />,
});

/**
 * Keyless OpenStreetMap/Leaflet canvas for the Leads map, plus a dismissible
 * "free tiles" note (prod should configure a dedicated tile provider via
 * NEXT_PUBLIC_OSM_TILE_URL). The canvas owns all map interaction.
 */
export function LeadsMap(props: LeadsMapCanvasProps) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const { className, ...rest } = props;

  return (
    <div data-testid="leads-map" className={cn('relative isolate z-0 h-full w-full', className)}>
      <LeadsMapCanvas {...rest} className="h-full w-full" />

      {!dismissed ? (
        <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[1000] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-theme-md backdrop-blur">
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{t('leads.map.osmTiles', 'Using free OpenStreetMap tiles')}</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('leads.map.dismiss', 'Dismiss')}
            className="-me-1 ms-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default LeadsMap;
