'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Leads map canvas — interactive OpenStreetMap/Leaflet map of located leads.
//
// Reuses the proven, keyless Leaflet approach from the Lead Generation map
// (DivIcon status markers, leaflet.markercluster via useMap — no react wrapper
// plugin, so no react-leaflet v5 compat risk, token-aware overlays, size
// invalidation, error boundary) but is tailored to LEADS: markers are styled by
// the real CRM lead status, hover/selection update IN PLACE (no full marker
// rebuild) so the map stays responsive with thousands of leads, and the drawing
// tools lasso leads for bulk actions rather than defining a discovery area.
//
// SSR: Leaflet needs `window`; this module (and leaflet's CSS) is imported ONLY
// through next/dynamic({ ssr:false }) in `leads-map.tsx`.
//
// PRODUCTION TILES: the public OSM / Esri endpoints are fine for dev/demo but
// their usage policies forbid heavy production traffic. Point
// NEXT_PUBLIC_OSM_TILE_URL / NEXT_PUBLIC_SATELLITE_TILE_URL at a dedicated tile
// provider (or self-hosted tiles) for production.
// ─────────────────────────────────────────────────────────────────────────────

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet.markercluster';
import {
  Component,
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
import { cn } from '@/lib/utils';
import { useMapTokenColors, type MapTokenColors } from '@/modules/leadGeneration/ui/map/use-token-colors';
import { useLanguage } from '../lead-ui-kit';
import type { LeadStatus } from '../../types/lead-types';
import type {
  LatLng,
  LeadMapArea,
  LeadMapDrawMode,
  LeadMapFocus,
  LeadMapPoint,
  LeadMapViewport,
} from './lead-map-types';
import { boundsOf } from './lead-map-types';
import { LEAD_MARKER_STYLE, leadStatusGlyph } from './lead-map-markers';
import { LeadMapUnavailable } from './lead-map-states';

type LeafletMapType = 'roadmap' | 'satellite';

// ── Keyless raster tile sources (no API key; attribution REQUIRED) ───────────
const LIGHT_TILES = {
  url: process.env.NEXT_PUBLIC_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
const SATELLITE_TILES = {
  url: process.env.NEXT_PUBLIC_SATELLITE_TILE_URL
    || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri',
};
const SATELLITE_LABEL_TILES = {
  url: process.env.NEXT_PUBLIC_SATELLITE_LABEL_TILE_URL
    || 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Labels &copy; Esri',
};

// Leaflet derives its default marker-icon URLs from its own <script> path, which
// bundlers rewrite → broken icon requests. Every marker here is a DivIcon, so
// this is only a safety net for any stray default marker (icons only, no key).
const LEAFLET_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images';
try {
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
    iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
    shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
  });
} catch {
  /* Leaflet not fully initialised — ignore; DivIcons don't need it. */
}

// ── Status DivIcon (solid pin + glyph; selected/hovered emphasis) ─────────────
function makeMarkerIcon(status: LeadStatus, selected: boolean, hovered: boolean): L.DivIcon {
  const size = selected ? 38 : hovered ? 32 : 28;
  const style = LEAD_MARKER_STYLE[status] ?? LEAD_MARKER_STYLE.new;
  const emphasis = selected
    ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
    : hovered
      ? 'scale-105 ring-2 ring-primary/50'
      : '';
  const html = `<span class="${cn(
    'flex h-full w-full items-center justify-center rounded-full border-2 shadow-theme-md transition-transform duration-150',
    style.marker,
    emphasis,
  )}">${leadStatusGlyph(status)}</span>`;
  return L.divIcon({
    html,
    // Neutralise Leaflet's default white box; `!` → !important beats .leaflet-div-icon.
    className: '!border-0 !bg-transparent',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 100 ? 44 : 54;
  const html = `<div class="flex h-full w-full items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-theme-lg ring-4 ring-background/80" style="font-size:${
    count < 100 ? 13 : 12
  }px" aria-label="${count} leads in this cluster">${count}</div>`;
  return L.divIcon({ html, className: '!border-0 !bg-transparent', iconSize: [size, size] });
}

// ── Markers + clustering. Full rebuild ONLY when the point set changes; hover /
//    selection update the affected markers in place (fast at scale). ───────────
function LeadClusterLayer({
  points,
  selectedId,
  hoveredId,
  onMarkerClick,
  onMarkerHover,
}: {
  points: LeadMapPoint[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const statusRef = useRef<Map<string, LeadStatus>>(new Map());

  const clickRef = useRef(onMarkerClick);
  const hoverRef = useRef(onMarkerHover);
  const selRef = useRef(selectedId);
  const hovRef = useRef(hoveredId);
  const prevSelRef = useRef<string | null | undefined>(null);
  const prevHovRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    clickRef.current = onMarkerClick;
    hoverRef.current = onMarkerHover;
    selRef.current = selectedId;
    hovRef.current = hoveredId;
  });

  // Create the cluster group once per map.
  useEffect(() => {
    if (!map) return undefined;
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 52,
      iconCreateFunction: (cluster) => makeClusterIcon(cluster.getChildCount()),
    });
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      markersRef.current.clear();
      statusRef.current.clear();
    };
  }, [map]);

  // Rebuild markers when the point SET changes (ids/status/coords), not on hover.
  const pointsSig = points.map((p) => `${p.id}:${p.status}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = new Map<string, L.Marker>();
    const statuses = new Map<string, LeadStatus>();
    const layers = points.map((p) => {
      const selected = p.id === selRef.current;
      const hovered = p.id === hovRef.current;
      const marker = L.marker([p.lat, p.lng], {
        icon: makeMarkerIcon(p.status, selected, hovered),
        zIndexOffset: selected ? 2000 : hovered ? 1000 : 0,
        keyboard: false,
      });
      marker.on('click', () => clickRef.current?.(p.id));
      marker.on('mouseover', () => hoverRef.current?.(p.id));
      marker.on('mouseout', () => hoverRef.current?.(null));
      markers.set(p.id, marker);
      statuses.set(p.id, p.status);
      return marker;
    });
    if (layers.length) group.addLayers(layers);
    markersRef.current = markers;
    statusRef.current = statuses;
    prevSelRef.current = selRef.current;
    prevHovRef.current = hovRef.current;
  }, [pointsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // In-place icon swap for the markers whose selected/hovered state changed.
  useEffect(() => {
    const markers = markersRef.current;
    const statuses = statusRef.current;
    const touched = new Set<string | null | undefined>([
      prevSelRef.current,
      prevHovRef.current,
      selectedId,
      hoveredId,
    ]);
    for (const id of touched) {
      if (!id) continue;
      const marker = markers.get(id);
      const status = statuses.get(id);
      if (!marker || !status) continue;
      const selected = id === selectedId;
      const hovered = id === hoveredId;
      marker.setIcon(makeMarkerIcon(status, selected, hovered));
      marker.setZIndexOffset(selected ? 2000 : hovered ? 1000 : 0);
    }
    prevSelRef.current = selectedId;
    prevHovRef.current = hoveredId;
  }, [selectedId, hoveredId]);

  return null;
}

// ── Fit all points into view (triggered by a bumping signal). ─────────────────
function FitController({ points, signal }: { points: LeadMapPoint[]; signal?: number }) {
  const map = useMap();
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (signal === undefined || signal === last.current) return;
    last.current = signal;
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 14));
      return;
    }
    const b = boundsOf(points);
    if (!b) return;
    map.fitBounds(
      [
        [b.south, b.west],
        [b.north, b.east],
      ],
      { padding: [48, 48], maxZoom: 16 },
    );
  }, [map, points, signal]);
  return null;
}

// ── Fly to a focused lead (list selection / "locate"). ────────────────────────
function FocusController({ focus }: { focus?: LeadMapFocus }) {
  const map = useMap();
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!focus || focus.nonce === last.current) return;
    last.current = focus.nonce;
    map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [map, focus]);
  return null;
}

// ── Emit viewport on move/zoom. ───────────────────────────────────────────────
function ViewportEmitter({ onViewportChange }: { onViewportChange?: (vp: LeadMapViewport) => void }) {
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

// Leaflet measures its container once at mount; this map lives inside a split
// layout that can finish sizing after mount, so re-invalidate a few times.
function MapSizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    if (!map) return undefined;
    const invalidate = () => map.invalidateSize({ pan: false });
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
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(invalidate);
    observer?.observe(container);
    if (parent) observer?.observe(parent);
    window.addEventListener('resize', invalidate);
    return () => {
      window.cancelAnimationFrame(frameOne);
      if (frameTwo) window.cancelAnimationFrame(frameTwo);
      timers.forEach((t) => window.clearTimeout(t));
      observer?.disconnect();
      window.removeEventListener('resize', invalidate);
    };
  }, [map]);
  return null;
}

// ── Committed area-select overlay + the drawing interactions. ─────────────────
const areaStyle = (colors: MapTokenColors): L.PathOptions => ({
  color: colors.primary,
  weight: 2.5,
  opacity: 0.95,
  fillColor: colors.primary,
  fillOpacity: 0.12,
});
const previewStyle = (colors: MapTokenColors): L.PathOptions => ({
  color: colors.primary,
  weight: 2,
  opacity: 0.9,
  fillColor: colors.primary,
  fillOpacity: 0.08,
  dashArray: '6 4',
});

function AreaOverlay({ area, colors }: { area: LeadMapArea | null | undefined; colors: MapTokenColors }) {
  if (!area) return null;
  const style = areaStyle(colors);
  if (area.kind === 'circle') {
    return <Circle center={[area.center.lat, area.center.lng]} radius={area.radiusMeters} pathOptions={style} />;
  }
  if (area.kind === 'rectangle') {
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
  if (area.points.length >= 3) {
    return <Polygon positions={area.points.map((p) => [p.lat, p.lng])} pathOptions={style} />;
  }
  return null;
}

type Preview =
  | { kind: 'circle'; center: L.LatLng; radius: number }
  | { kind: 'rect'; bounds: L.LatLngBounds }
  | { kind: 'poly'; points: L.LatLng[] };

function DrawController({
  drawMode,
  onAreaDraw,
  colors,
}: {
  drawMode: LeadMapDrawMode;
  onAreaDraw?: (area: LeadMapArea) => void;
  colors: MapTokenColors;
}) {
  const map = useMap();
  const [preview, setPreview] = useState<Preview | null>(null);
  const emitRef = useRef(onAreaDraw);
  useEffect(() => {
    emitRef.current = onAreaDraw;
  });

  useEffect(() => {
    if (!map || !drawMode) {
      setPreview(null);
      return undefined;
    }
    const emit = (area: LeadMapArea) => emitRef.current?.(area);

    if (drawMode === 'circle' || drawMode === 'rectangle') {
      let start: L.LatLng | null = null;
      const onDown = (e: L.LeafletMouseEvent) => {
        start = e.latlng;
        map.dragging.disable();
      };
      const onMove = (e: L.LeafletMouseEvent) => {
        if (!start) return;
        if (drawMode === 'circle') {
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
        if (drawMode === 'circle') {
          const r = map.distance(from, e.latlng);
          if (r >= 1) emit({ kind: 'circle', center: { lat: from.lat, lng: from.lng }, radiusMeters: r });
        } else {
          const b = L.latLngBounds(from, e.latlng);
          if (b.isValid()) {
            emit({
              kind: 'rectangle',
              bounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
            });
          }
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
      if (points.length >= 3) emit({ kind: 'polygon', points: points.map((p) => ({ lat: p.lat, lng: p.lng })) });
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
  }, [map, drawMode]);

  if (!preview) return null;
  const style = previewStyle(colors);
  if (preview.kind === 'circle') return <Circle center={preview.center} radius={preview.radius} pathOptions={style} />;
  if (preview.kind === 'rect') return <Rectangle bounds={preview.bounds} pathOptions={style} />;
  if (preview.points.length >= 2) return <Polyline positions={preview.points} pathOptions={style} />;
  return null;
}

// ── Map-type control (roadmap OSM / satellite imagery). ───────────────────────
function MapTypeControl({
  isRTL,
  mapType,
  onMapTypeChange,
}: {
  isRTL: boolean;
  mapType: LeafletMapType;
  onMapTypeChange: (t: LeafletMapType) => void;
}) {
  const { t } = useLanguage();
  const buttonClass = (active: boolean) => cn(
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
    active ? 'bg-primary text-primary-foreground shadow-theme-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    isRTL && 'flex-row-reverse',
  );
  return (
    <div
      role="group"
      aria-label={t('leads.map.mapType', 'Map type')}
      className="pointer-events-auto absolute top-3 end-3 z-[1000] flex gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-theme-md backdrop-blur"
    >
      <button type="button" aria-pressed={mapType === 'roadmap'} onClick={() => onMapTypeChange('roadmap')} className={buttonClass(mapType === 'roadmap')}>
        <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('leads.map.roadmap', 'Map')}</span>
      </button>
      <button type="button" aria-pressed={mapType === 'satellite'} onClick={() => onMapTypeChange('satellite')} className={buttonClass(mapType === 'satellite')}>
        <Satellite className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('leads.map.satellite', 'Satellite')}</span>
      </button>
    </div>
  );
}

export interface LeadsMapCanvasProps {
  center: LatLng;
  zoom?: number;
  points: LeadMapPoint[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
  onViewportChange?: (vp: LeadMapViewport) => void;
  focus?: LeadMapFocus;
  fitSignal?: number;
  drawMode?: LeadMapDrawMode;
  area?: LeadMapArea | null;
  onAreaDraw?: (area: LeadMapArea) => void;
  className?: string;
}

function LeadsMapInner({
  center,
  zoom,
  points,
  selectedId,
  hoveredId,
  onMarkerClick,
  onMarkerHover,
  onViewportChange,
  focus,
  fitSignal,
  drawMode,
  area,
  onAreaDraw,
  className,
}: LeadsMapCanvasProps) {
  const { isRTL = false } = useLanguage();
  const colors = useMapTokenColors();
  const [mapType, setMapType] = useState<LeafletMapType>('roadmap');
  const isSatellite = mapType === 'satellite';
  const tiles = isSatellite ? SATELLITE_TILES : LIGHT_TILES;

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="leads-map-canvas"
      className={cn(
        'relative isolate z-0 h-full min-h-[320px] w-full overflow-hidden bg-muted',
        drawMode && 'cursor-crosshair [&_.leaflet-grab]:cursor-crosshair',
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
        style={{ background: isSatellite ? '#0b0f19' : '#e5e7eb' }}
      >
        <TileLayer key={mapType} url={tiles.url} attribution={tiles.attribution} maxZoom={19} />
        {isSatellite ? (
          <TileLayer
            key="satellite-labels"
            url={SATELLITE_LABEL_TILES.url}
            attribution={SATELLITE_LABEL_TILES.attribution}
            maxZoom={19}
            opacity={0.95}
            zIndex={2}
          />
        ) : null}
        <ZoomControl position={isRTL ? 'topright' : 'topleft'} />
        <AreaOverlay area={area} colors={colors} />
        <DrawController drawMode={drawMode ?? null} onAreaDraw={onAreaDraw} colors={colors} />
        <LeadClusterLayer
          points={points}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
        />
        <FitController points={points} signal={fitSignal} />
        <FocusController focus={focus} />
        <ViewportEmitter onViewportChange={onViewportChange} />
        <MapSizeInvalidator />
      </MapContainer>

      <MapTypeControl isRTL={isRTL} mapType={mapType} onMapTypeChange={setMapType} />
    </div>
  );
}

// Any Leaflet init/render failure degrades to the shared "map failed to load"
// state instead of taking down the whole overlay.
class MapErrorBoundary extends Component<{ className?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[LeadsMapCanvas] failed to render the map:', error);
    }
  }
  render() {
    if (this.state.failed) return <LeadMapUnavailable variant="error" className={this.props.className} />;
    return this.props.children;
  }
}

export function LeadsMapCanvas(props: LeadsMapCanvasProps) {
  return (
    <MapErrorBoundary className={props.className}>
      <LeadsMapInner {...props} />
    </MapErrorBoundary>
  );
}

export default LeadsMapCanvas;
