'use client';

// ─────────────────────────────────────────────────────────────────────────────
// KEYLESS map fallback for Lead Generation / Business Discovery.
//
// Renders a fully interactive map with OpenStreetMap raster tiles via Leaflet,
// so the discovery map works with NO Google Maps browser key. It mirrors the
// Google canvas contract (DiscoveryMapProps) exactly and emits the IDENTICAL
// normalized AreaDraft (GeoJSON [lng,lat], closed rings) using the shared pure
// helpers in map-geometry.ts — so the two maps are interchangeable upstream.
//
// PRODUCTION NOTE: OpenStreetMap's public tile endpoint is fine for
// development/demo but its usage policy forbids heavy production traffic.
// For production, set NEXT_PUBLIC_OSM_TILE_URL to a dedicated tile provider or a
// self-hosted OSM tile server. Discovery search is controlled separately by the
// server-side discovery provider mode.
//
// SSR: Leaflet needs `window`. This module (and `leaflet/dist/leaflet.css`) is
// loaded ONLY on the client — `discovery-map.tsx` imports it through
// next/dynamic({ ssr: false }), so none of the Leaflet code runs during the
// server render.
// ─────────────────────────────────────────────────────────────────────────────

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Circle,
  MapContainer,
  Polygon,
  Polyline,
  Rectangle,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Map as MapIcon, Satellite } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { AreaDraft } from '../../state/lead-gen-store';
import type { GeoPoint, MatchingStatus } from '../../types/discovery-types';
import type { DiscoveryMapProps, DiscoveryMapResult } from './types';
import { MapUnavailable } from './map-unavailable';
import { DrawingHint, RadiusSlider } from './map-controls';
import { useMapTokenColors, type MapTokenColors } from './use-token-colors';
import {
  DEFAULT_RADIUS_METERS,
  areaCenter,
  circleToAreaDraft,
  geometryToLatLngPath,
  polygonToAreaDraft,
  rectangleToAreaDraft,
} from './map-geometry';

// ── Keyless raster tile sources (no API key, attribution REQUIRED) ───────────
const LIGHT_TILES = {
  url: process.env.NEXT_PUBLIC_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: '',
};
const DARK_TILES = {
  // Default dark mode intentionally reuses keyless OpenStreetMap tiles and
  // applies a local CSS filter below. Some third-party "free" dark tile hosts
  // now return API-key watermarks, which made the map appear broken.
  url: process.env.NEXT_PUBLIC_OSM_DARK_TILE_URL || process.env.NEXT_PUBLIC_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: '',
};

// Leaflet derives its default marker-icon URLs from its own <script> path, which
// bundlers (webpack/Next) rewrite — producing broken icon requests. Every result
// marker here uses a DivIcon (below), so this is a safety net for any stray
// default marker: point the three assets at the pinned Leaflet CDN build (icons
// only — NOT tiles, and no key required).
const LEAFLET_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images';
try {
  // `_getIconUrl` is the method that computes the broken paths; removing it makes
  // Leaflet fall back to the explicit URLs we merge in.
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
    iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
    shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
  });
} catch {
  /* Leaflet not fully initialised (e.g. exotic SSR) — ignore; DivIcons don't need it. */
}

// ── Status-styled DivIcons (icon + color, never color-only — mirrors marker-pin) ─
// Distinct inline SVG glyph per status so meaning survives greyscale /
// color-blindness. Full literal Tailwind class strings so the scanner emits them.
const STATUS_CLASSES: Record<MatchingStatus, string> = {
  NEW: 'bg-primary text-primary-foreground border-primary',
  EXISTING: 'bg-card text-muted-foreground border-border',
  POSSIBLE_DUPLICATE: 'bg-warning text-warning-foreground border-warning',
};

function statusGlyph(status: MatchingStatus): string {
  const common = 'viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"';
  if (status === 'NEW') {
    // Sparkle / star — "new".
    return `<svg ${common} fill="currentColor"><path d="M12 2l2.3 6.1L20.5 10l-6.2 1.9L12 18l-2.3-6.1L3.5 10l6.2-1.9z"/></svg>`;
  }
  if (status === 'POSSIBLE_DUPLICATE') {
    // Overlapping squares + check — "possible duplicate".
    return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/><path d="M12 14.5l1.8 1.8 3.2-3.6"/></svg>`;
  }
  // Building — "existing".
  return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="9" height="18" rx="1"/><path d="M14 8h5v13"/><path d="M8.5 7h1M8.5 11h1M8.5 15h1"/></svg>`;
}

function makeMarkerIcon(status: MatchingStatus, selected: boolean, hovered: boolean): L.DivIcon {
  const size = selected ? 36 : hovered ? 32 : 28;
  const emphasis = selected
    ? 'scale-110 ring-2 ring-primary ring-offset-1 ring-offset-background'
    : hovered
      ? 'scale-105 ring-2 ring-primary/50'
      : '';
  const html = `<span class="${cn(
    'flex h-full w-full items-center justify-center rounded-full border shadow-theme-sm transition-transform',
    STATUS_CLASSES[status],
    emphasis,
  )}">${statusGlyph(status)}</span>`;
  return L.divIcon({
    html,
    // Neutralise Leaflet's default white box; `!` → !important wins over .leaflet-div-icon.
    className: '!border-0 !bg-transparent',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 34 : count < 100 ? 42 : 52;
  const html = `<div class="flex h-full w-full items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-theme-md ring-2 ring-background" style="font-size:${
    count < 100 ? 13 : 12
  }px" aria-label="${count} businesses in this cluster">${count}</div>`;
  return L.divIcon({ html, className: '!border-0 !bg-transparent', iconSize: [size, size] });
}

// ── Pure render helpers ──────────────────────────────────────────────────────
const areaStyle = (colors: MapTokenColors): L.PathOptions => ({
  color: colors.primary,
  weight: 2.5,
  opacity: 0.95,
  fillColor: colors.primary,
  fillOpacity: 0.15,
});
const previewStyle = (colors: MapTokenColors): L.PathOptions => ({
  color: colors.primary,
  weight: 2,
  opacity: 0.9,
  fillColor: colors.primary,
  fillOpacity: 0.1,
  dashArray: '6 4',
});

// ── Committed area overlay (single source of truth = the `area` prop) ─────────
function AreaOverlay({
  area,
  center,
  colors,
}: {
  area: AreaDraft | null | undefined;
  center: GeoPoint;
  colors: MapTokenColors;
}) {
  if (!area?.type) return null;
  const style = areaStyle(colors);

  if (area.type === 'radius' || area.type === 'circle') {
    const c = areaCenter(area) ?? center;
    return (
      <Circle center={[c.lat, c.lng]} radius={area.radiusMeters ?? DEFAULT_RADIUS_METERS} pathOptions={style} />
    );
  }
  if (area.type === 'rectangle') {
    if (!area.bounds) return null;
    const b = area.bounds;
    return (
      <Rectangle
        bounds={[
          [b.south, b.west],
          [b.north, b.east],
        ]}
        pathOptions={style}
      />
    );
  }
  if (area.type === 'polygon') {
    const path = geometryToLatLngPath(area.geometry);
    if (path.length < 3) return null;
    return <Polygon positions={path.map((p) => [p.lat, p.lng])} pathOptions={style} />;
  }
  return null;
}

// ── Drawing: manual Leaflet handlers (no leaflet-draw/geoman → no plugin-compat
//    risk). Each completed shape is normalized to an AreaDraft via map-geometry. ─
type Preview =
  | { kind: 'circle'; center: L.LatLng; radius: number }
  | { kind: 'rect'; bounds: L.LatLngBounds }
  | { kind: 'poly'; points: L.LatLng[] };

function DrawController({
  drawingMode,
  area,
  center,
  onAreaChange,
  colors,
}: {
  drawingMode: DiscoveryMapProps['drawingMode'];
  area: AreaDraft | null | undefined;
  center: GeoPoint;
  onAreaChange?: (area: AreaDraft) => void;
  colors: MapTokenColors;
}) {
  const map = useMap();
  const [preview, setPreview] = useState<Preview | null>(null);

  // Refs keep the event handlers stable so an in-progress draw is never
  // interrupted by a new onAreaChange / radius value identity.
  const areaRef = useRef(area);
  const centerRef = useRef(center);
  const onChangeRef = useRef(onAreaChange);
  useEffect(() => {
    areaRef.current = area;
    centerRef.current = center;
    onChangeRef.current = onAreaChange;
  });

  useEffect(() => {
    if (!map || !drawingMode) return;
    const emit = (next: AreaDraft) => onChangeRef.current?.(next);

    if (drawingMode === 'radius') {
      // Click re-centers the radius circle; the slider controls its size.
      const onClick = (e: L.LeafletMouseEvent) => {
        const r = areaRef.current?.radiusMeters ?? DEFAULT_RADIUS_METERS;
        emit(circleToAreaDraft({ lat: e.latlng.lat, lng: e.latlng.lng }, r, 'radius'));
      };
      map.on('click', onClick);
      return () => {
        map.off('click', onClick);
      };
    }

    if (drawingMode === 'circle' || drawingMode === 'rectangle') {
      // Click-and-drag rubber-band (map pan disabled while drawing).
      let start: L.LatLng | null = null;
      const onDown = (e: L.LeafletMouseEvent) => {
        start = e.latlng;
        map.dragging.disable();
      };
      const onMove = (e: L.LeafletMouseEvent) => {
        if (!start) return;
        if (drawingMode === 'circle') {
          setPreview({ kind: 'circle', center: start, radius: map.distance(start, e.latlng) });
        } else {
          setPreview({ kind: 'rect', bounds: L.latLngBounds(start, e.latlng) });
        }
      };
      const onUp = (e: L.LeafletMouseEvent) => {
        map.dragging.enable();
        const from = start;
        start = null;
        setPreview(null);
        if (!from) return;
        if (drawingMode === 'circle') {
          const r = map.distance(from, e.latlng);
          if (r >= 1) emit(circleToAreaDraft({ lat: from.lat, lng: from.lng }, r, 'circle'));
        } else {
          const b = L.latLngBounds(from, e.latlng);
          if (b.isValid())
            emit(
              rectangleToAreaDraft({
                north: b.getNorth(),
                south: b.getSouth(),
                east: b.getEast(),
                west: b.getWest(),
              }),
            );
        }
      };
      map.on('mousedown', onDown);
      map.on('mousemove', onMove);
      map.on('mouseup', onUp);
      return () => {
        map.off('mousedown', onDown);
        map.off('mousemove', onMove);
        map.off('mouseup', onUp);
        map.dragging.enable();
      };
    }

    // polygon: click to add vertices, double-click to finish.
    const points: L.LatLng[] = [];
    const onClick = (e: L.LeafletMouseEvent) => {
      points.push(e.latlng);
      setPreview({ kind: 'poly', points: [...points] });
    };
    const onDbl = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e.originalEvent);
      if (points.length >= 3) {
        emit(polygonToAreaDraft(points.map((p) => ({ lat: p.lat, lng: p.lng }))));
      }
      points.length = 0;
      setPreview(null);
    };
    map.doubleClickZoom.disable();
    map.on('click', onClick);
    map.on('dblclick', onDbl);
    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDbl);
      map.doubleClickZoom.enable();
    };
    // Stable by design — only re-bind when the map or active mode changes
    // (area/center/onAreaChange are read through refs so a draw is never cut off).
  }, [map, drawingMode]);

  if (!preview) return null;
  const style = previewStyle(colors);
  if (preview.kind === 'circle') {
    return <Circle center={preview.center} radius={preview.radius} pathOptions={style} />;
  }
  if (preview.kind === 'rect') {
    return <Rectangle bounds={preview.bounds} pathOptions={style} />;
  }
  if (preview.points.length >= 2) {
    return <Polyline positions={preview.points} pathOptions={style} />;
  }
  return null;
}

// ── Result markers + clustering (leaflet.markercluster via useMap — no React
//    wrapper plugin, so no react-leaflet v5 compat risk). ───────────────────────
function ResultClusterLayer({
  results,
  selectedResultId,
  hoveredResultId,
  onMarkerClick,
  onMarkerHover,
}: {
  results: DiscoveryMapResult[];
  selectedResultId?: string | null;
  hoveredResultId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const clickRef = useRef(onMarkerClick);
  const hoverRef = useRef(onMarkerHover);
  useEffect(() => {
    clickRef.current = onMarkerClick;
    hoverRef.current = onMarkerHover;
  });

  // Create the cluster group once per map.
  useEffect(() => {
    if (!map) return;
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
      iconCreateFunction: (cluster) => makeClusterIcon(cluster.getChildCount()),
    });
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // Rebuild markers when the data / selection / hover changes.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = results.map((r) => {
      const selected = r.id === selectedResultId;
      const hovered = r.id === hoveredResultId;
      const marker = L.marker([r.lat, r.lng], {
        icon: makeMarkerIcon(r.status, selected, hovered),
        zIndexOffset: selected ? 2000 : hovered ? 1000 : 0,
        keyboard: false,
      });
      marker.on('click', () => clickRef.current?.(r.id));
      marker.on('mouseover', () => hoverRef.current?.(r.id));
      marker.on('mouseout', () => hoverRef.current?.(null));
      return marker;
    });
    if (markers.length) group.addLayers(markers);
  }, [results, selectedResultId, hoveredResultId]);

  return null;
}

// ── Emit viewport on move/zoom (mirrors the Google canvas `onIdle`). ──────────
function ViewportEmitter({ onViewportChange }: { onViewportChange?: DiscoveryMapProps['onViewportChange'] }) {
  const ref = useRef(onViewportChange);
  useEffect(() => {
    ref.current = onViewportChange;
  });
  const emit = (m: L.Map) => {
    const c = m.getCenter();
    const b = m.getBounds();
    ref.current?.({
      center: { lat: c.lat, lng: c.lng },
      zoom: m.getZoom(),
      bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
    });
  };
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  return null;
}

// Leaflet measures its container only once at mount. In this app the map lives
// inside a split workflow layout that can finish sizing after the canvas mounts,
// so without invalidation Leaflet may paint only a small block of tiles.
function MapSizeInvalidator({ center, zoom }: { center: GeoPoint; zoom?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return undefined;

    const invalidate = () => {
      map.invalidateSize({ pan: false });
    };

    let frameTwo = 0;
    const frameOne = window.requestAnimationFrame(() => {
      invalidate();
      frameTwo = window.requestAnimationFrame(invalidate);
    });
    const timers = [
      window.setTimeout(invalidate, 120),
      window.setTimeout(invalidate, 360),
      window.setTimeout(invalidate, 900),
    ];

    const container = map.getContainer();
    const parent = container.parentElement;
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => invalidate());
    observer?.observe(container);
    if (parent) observer?.observe(parent);
    window.addEventListener('resize', invalidate);

    return () => {
      window.cancelAnimationFrame(frameOne);
      if (frameTwo) window.cancelAnimationFrame(frameTwo);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer?.disconnect();
      window.removeEventListener('resize', invalidate);
    };
  }, [map, center.lat, center.lng, zoom]);

  return null;
}

// ── Pan/zoom to follow the `center` prop (e.g. after a location search). ──────
function CenterController({ center, zoom }: { center: GeoPoint; zoom?: number }) {
  const map = useMap();
  const last = useRef(`${center.lat},${center.lng}`);
  useEffect(() => {
    const key = `${center.lat},${center.lng}`;
    if (key === last.current) return;
    last.current = key;
    map.setView([center.lat, center.lng], typeof zoom === 'number' ? zoom : map.getZoom());
  }, [map, center, zoom]);
  return null;
}

// ── Minimal, honest map-type control. OSM has no free satellite imagery, so the
//    Satellite option is shown but disabled with an explanatory tooltip. ───────
function LeafletMapTypeControl({ isRTL }: { isRTL: boolean }) {
  const { t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t('leadgen.map.mapType', 'Map type')}
      className="pointer-events-auto absolute top-3 end-3 z-[1000] flex gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-theme-md backdrop-blur"
    >
      <span
        aria-pressed="true"
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shadow-theme-sm"
      >
        <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('leadgen.map.roadmap', 'Map')}</span>
      </span>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={t('leadgen.map.satelliteUnavailable', 'Satellite view requires a Google Maps key')}
        className={cn(
          'inline-flex cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground/60',
          isRTL && 'flex-row-reverse',
        )}
      >
        <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('leadgen.map.satellite', 'Satellite')}</span>
      </button>
    </div>
  );
}

// ── Inner canvas ─────────────────────────────────────────────────────────────
function LeafletMapInner({
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
  className,
}: DiscoveryMapProps) {
  const { resolvedTheme } = useTheme();
  const { isRTL } = useLanguage();
  const colors = useMapTokenColors();
  const dark = resolvedTheme === 'dark';
  const tiles = dark ? DARK_TILES : LIGHT_TILES;

  const onAreaChangeRef = useRef(onAreaChange);
  useEffect(() => {
    onAreaChangeRef.current = onAreaChange;
  });

  // Radius mode seeds a default circle at the current centre if none exists yet
  // (mirrors the Google AreaLayer behaviour).
  useEffect(() => {
    if (drawingMode !== 'radius') return;
    if (area && area.type === 'radius' && area.radiusMeters) return;
    const c = areaCenter(area) ?? center;
    onAreaChangeRef.current?.(circleToAreaDraft(c, area?.radiusMeters ?? DEFAULT_RADIUS_METERS, 'radius'));
  }, [drawingMode, area, center]);

  const handleRadiusChange = useCallback(
    (meters: number) => {
      const c = areaCenter(area) ?? center;
      onAreaChangeRef.current?.(circleToAreaDraft(c, meters, 'radius'));
    },
    [area, center],
  );

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="leaflet-map-canvas"
      className={cn(
        'relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-border bg-muted',
        className,
      )}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom ?? 12}
        scrollWheelZoom
        zoomControl={false}
        attributionControl
        className="h-full w-full"
        // Leaflet's container needs a concrete background so partially-loaded
        // tiles don't flash white in dark mode.
        style={{ background: dark ? '#0b0f19' : '#e5e7eb' }}
      >
        {/* `key` forces a fresh TileLayer when the theme flips so tiles reload. */}
        <TileLayer
          key={dark ? 'dark' : 'light'}
          url={tiles.url}
          attribution={tiles.attribution}
          subdomains={tiles.subdomains}
          maxZoom={19}
          className={dark ? 'leadgen-osm-dark-tiles' : undefined}
        />
        <ZoomControl position={isRTL ? 'topright' : 'topleft'} />
        <AreaOverlay area={area} center={center} colors={colors} />
        <DrawController
          drawingMode={drawingMode}
          area={area}
          center={center}
          onAreaChange={onAreaChange}
          colors={colors}
        />
        <ResultClusterLayer
          results={results}
          selectedResultId={selectedResultId}
          hoveredResultId={hoveredResultId}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
        />
        <ViewportEmitter onViewportChange={onViewportChange} />
        <MapSizeInvalidator center={center} zoom={zoom} />
        <CenterController center={center} zoom={zoom} />
      </MapContainer>

      <LeafletMapTypeControl isRTL={isRTL} />
      {drawingMode === 'radius' ? (
        <RadiusSlider radiusMeters={area?.radiusMeters ?? DEFAULT_RADIUS_METERS} onChange={handleRadiusChange} />
      ) : null}
      {drawingMode ? <DrawingHint drawingMode={drawingMode} /> : null}
    </div>
  );
}

// ── Error boundary ───────────────────────────────────────────────────────────
// Any Leaflet init/render failure degrades to the shared "map failed to load"
// placeholder instead of taking down the wizard. (This is also what keeps the
// map harmless in jsdom/unit tests, where Leaflet's SVG/Canvas vector renderers
// cannot run.)
class MapErrorBoundary extends Component<
  { className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[LeafletMapCanvas] failed to render the map:', error);
    }
  }
  render() {
    if (this.state.failed) return <MapUnavailable variant="error" className={this.props.className} />;
    return this.props.children;
  }
}

/**
 * Client-only keyless map canvas (OpenStreetMap via Leaflet). Loaded lazily by
 * `DiscoveryMap` through next/dynamic({ ssr: false }). Implements the exact same
 * `DiscoveryMapProps` contract as the Google canvas and emits identical
 * AreaDraft values, so the two are drop-in interchangeable.
 */
export function LeafletMapCanvas(props: DiscoveryMapProps) {
  return (
    <MapErrorBoundary className={props.className}>
      <LeafletMapInner {...props} />
    </MapErrorBoundary>
  );
}

export default LeafletMapCanvas;
