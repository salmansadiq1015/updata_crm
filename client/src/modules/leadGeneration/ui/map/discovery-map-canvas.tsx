'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  ColorScheme,
  Map,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import type { GeoPoint } from '../../types/discovery-types';
import type { DiscoveryMapCanvasProps, DiscoveryMapTypeId, DiscoveryMapViewport } from './types';
import { MapUnavailable } from './map-unavailable';
import { AreaLayer } from './area-layer';
import { ResultMarkers } from './result-markers';
import { DrawingHint, MapTypeToggle, RadiusSlider } from './map-controls';
import { DEFAULT_RADIUS_METERS, areaCenter, circleToAreaDraft } from './map-geometry';

// Advanced markers require a vector map id. A project-specific id can be supplied
// for cloud styling; otherwise Google's public DEMO_MAP_ID enables vector maps +
// advanced markers out of the box (dark/light handled via `colorScheme`).
const MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '').trim() || 'DEMO_MAP_ID';

/** Pans the map when the `center` prop changes (e.g. after a location search). */
function CameraController({ center, zoom }: { center: GeoPoint; zoom?: number }) {
  const map = useMap();
  const lastRef = useRef(`${center.lat},${center.lng}`);
  useEffect(() => {
    if (!map) return;
    const key = `${center.lat},${center.lng}`;
    if (key === lastRef.current) return;
    lastRef.current = key;
    map.panTo(center);
    if (typeof zoom === 'number') map.setZoom(zoom);
  }, [map, center, zoom]);
  return null;
}

function DiscoveryMapInner({
  center,
  zoom,
  area,
  drawingMode,
  onAreaChange,
  results = [],
  selectedResultId,
  hoveredResultId,
  onMarkerClick,
  onMarkerHover,
  onViewportChange,
  mapTypeId,
  className,
}: Omit<DiscoveryMapCanvasProps, 'apiKey'>) {
  const status = useApiLoadingStatus();
  const { resolvedTheme } = useTheme();
  const colorScheme = resolvedTheme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT;

  // Map type is controlled by the `mapTypeId` prop when provided, otherwise it
  // falls back to internal state (derived during render — no mirror effect).
  const [internalMapType, setInternalMapType] = useState<DiscoveryMapTypeId>('roadmap');
  const mapType = mapTypeId ?? internalMapType;

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const emitViewport = useCallback((mapInstance: google.maps.Map) => {
    const c = mapInstance.getCenter();
    const z = mapInstance.getZoom();
    if (!c || typeof z !== 'number') return;
    const vp: DiscoveryMapViewport = { center: { lat: c.lat(), lng: c.lng() }, zoom: z };
    const b = mapInstance.getBounds();
    if (b) {
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      vp.bounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
    }
    onViewportChangeRef.current?.(vp);
  }, []);

  const handleRadiusChange = useCallback(
    (meters: number) => {
      const c = areaCenter(area) ?? center;
      onAreaChange?.(circleToAreaDraft(c, meters, 'radius'));
    },
    [area, center, onAreaChange],
  );

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return <MapUnavailable variant="error" className={className} />;
  }

  return (
    <div
      data-testid="discovery-map-canvas"
      className={cn(
        'relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-border bg-muted',
        className,
      )}
    >
      <Map
        // vis.gl recreates the map instance internally when `colorScheme`
        // changes, so toggling the app theme switches the map between
        // Google's light/dark styling without any manual remount.
        mapId={MAP_ID}
        colorScheme={colorScheme}
        mapTypeId={mapType}
        defaultCenter={center}
        defaultZoom={zoom ?? 12}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="h-full w-full"
        onIdle={(event) => emitViewport(event.map)}
      >
        <CameraController center={center} zoom={zoom} />
        <AreaLayer
          area={area}
          center={center}
          drawingMode={drawingMode}
          onAreaChange={onAreaChange}
        />
        <ResultMarkers
          results={results}
          selectedResultId={selectedResultId}
          hoveredResultId={hoveredResultId}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
        />
      </Map>

      <MapTypeToggle value={mapType} onChange={setInternalMapType} />
      {drawingMode === 'radius' ? (
        <RadiusSlider
          radiusMeters={area?.radiusMeters ?? DEFAULT_RADIUS_METERS}
          onChange={handleRadiusChange}
        />
      ) : null}
      {drawingMode ? <DrawingHint drawingMode={drawingMode} /> : null}
    </div>
  );
}

/**
 * Client-only map canvas. Loaded lazily by `DiscoveryMap` (next/dynamic,
 * ssr:false) so the Google SDK is only pulled in when the map actually mounts.
 */
export function DiscoveryMapCanvas({ apiKey, ...props }: DiscoveryMapCanvasProps) {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return <MapUnavailable variant="error" className={props.className} />;
  }

  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['marker']}
      onError={() => setLoadError(true)}
    >
      <DiscoveryMapInner {...props} />
    </APIProvider>
  );
}
