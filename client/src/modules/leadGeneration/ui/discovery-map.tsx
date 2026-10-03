'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { MapLoading } from './map/map-unavailable';
import type {
  DiscoveryDrawingMode,
  DiscoveryMapProps,
  DiscoveryMapResult,
  DiscoveryMapTypeId,
  DiscoveryMapViewport,
} from './map/types';

// Both canvases are pulled into the bundle — and executed — only when they
// actually mount on the client. next/dynamic with ssr:false keeps the Google SDK
// AND Leaflet (which both need `window`, and Leaflet's CSS) out of the server
// render entirely.
const GoogleMapCanvas = dynamic(
  () => import('./map/discovery-map-canvas').then((m) => m.DiscoveryMapCanvas),
  {
    ssr: false,
    loading: () => <MapLoading />,
  },
);

const LeafletMapCanvas = dynamic(
  () => import('./map/leaflet-map-canvas').then((m) => m.LeafletMapCanvas),
  {
    ssr: false,
    loading: () => <MapLoading />,
  },
);

/** Browser key env var the deployment can provide to use Google tiles. */
export const GOOGLE_MAPS_BROWSER_KEY_ENV = 'NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY';

/**
 * Interactive map for Lead Generation / Business Discovery.
 *
 * - With a Google Maps browser key → the Google canvas (vector map, Advanced
 *   Markers, Map/Satellite, cloud styling).
 * - Without a key → a KEYLESS OpenStreetMap fallback rendered with Leaflet, so
 *   the map still works for free (OSM/Carto raster tiles). A small, dismissible
 *   note points out how to switch to Google tiles.
 *
 * Both canvases share the exact same `DiscoveryMapProps` contract and emit
 * identical AreaDraft values. The "map unavailable" placeholder now only appears
 * on an ACTUAL load/render error (handled inside each canvas), never merely
 * because a Google key is missing.
 *
 * NOTE: discovery SEARCH always needs the server-side GOOGLE_PLACES_API_KEY,
 * independent of which map renders — map tiles and Places data are separate.
 */
export function DiscoveryMap(props: DiscoveryMapProps) {
  const apiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '').trim();

  if (apiKey) {
    return <GoogleMapCanvas {...props} apiKey={apiKey} />;
  }

  return <LeafletFallbackMap {...props} />;
}

/** Keyless Leaflet map + a dismissible "you're on the free fallback" note. */
function LeafletFallbackMap(props: DiscoveryMapProps) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const { className, ...rest } = props;

  return (
    <div
      data-testid="discovery-map-osm-fallback"
      className={cn('relative h-full min-h-[320px] w-full', className)}
    >
      <LeafletMapCanvas {...rest} className="h-full w-full" />

      {!dismissed ? (
        <div
          data-testid="discovery-map-osm-note"
          className="pointer-events-auto absolute bottom-3 left-1/2 z-[1100] flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-theme-md backdrop-blur"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {t('leadgen.map.osmFallback', 'Using OpenStreetMap — add a Google Maps key for Google tiles')}
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('leadgen.map.dismiss', 'Dismiss')}
            className="-me-1 ms-1 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type {
  DiscoveryMapProps,
  DiscoveryMapResult,
  DiscoveryMapViewport,
  DiscoveryDrawingMode,
  DiscoveryMapTypeId,
};
