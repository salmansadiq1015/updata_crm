'use client';

import { useEffect, useRef } from 'react';
import { Circle, Polygon, Rectangle, useMap } from '@vis.gl/react-google-maps';
import type { AreaDraft } from '../../state/lead-gen-store';
import type { GeoPoint } from '../../types/discovery-types';
import type { DiscoveryDrawingMode } from './types';
import { useMapTokenColors } from './use-token-colors';
import {
  DEFAULT_RADIUS_METERS,
  areaCenter,
  areasEqual,
  boundsToLiteral,
  circleToAreaDraft,
  geometryToLatLngPath,
  haversineDistance,
  polygonToAreaDraft,
  rectangleToAreaDraft,
} from './map-geometry';

interface AreaLayerProps {
  area?: AreaDraft | null;
  center: GeoPoint;
  drawingMode?: DiscoveryDrawingMode | null;
  onAreaChange?: (area: AreaDraft) => void;
}

const toPoint = (ll: google.maps.LatLng | null | undefined): GeoPoint | null =>
  ll ? { lat: ll.lat(), lng: ll.lng() } : null;

/**
 * Renders the selected area as a translucent primary overlay with a stronger
 * primary border (branding §17), keeps it editable, and drives free-draw for
 * circle / rectangle / polygon. The Maps `drawing` library (DrawingManager) was
 * removed in Maps JS API v3.65, so free-draw is implemented directly on native
 * map events (drag for circle/rectangle, click + double-click for polygon).
 * Radius mode is a declarative editable circle fed by the radius slider.
 *
 * Single source of truth is the `area` prop: draws/edits are normalized to an
 * `AreaDraft` (GeoJSON [lng,lat]) and emitted via `onAreaChange`; the parent
 * echoes it back for rendering.
 */
export function AreaLayer({ area, center, drawingMode, onAreaChange }: AreaLayerProps) {
  const map = useMap();
  const colors = useMapTokenColors();

  // Refs keep the drawing-manager effect stable so an in-progress draw is never
  // interrupted by a new `onAreaChange`/color identity.
  const onAreaChangeRef = useRef(onAreaChange);
  const areaRef = useRef(area);
  useEffect(() => {
    onAreaChangeRef.current = onAreaChange;
    areaRef.current = area;
  }, [onAreaChange, area]);

  const circleRef = useRef<google.maps.Circle | null>(null);
  const rectRef = useRef<google.maps.Rectangle | null>(null);
  const polyRef = useRef<google.maps.Polygon | null>(null);

  const emit = (next: AreaDraft) => {
    if (areasEqual(next, areaRef.current)) return;
    onAreaChangeRef.current?.(next);
  };

  const managerActive =
    drawingMode === 'circle' || drawingMode === 'rectangle' || drawingMode === 'polygon';

  // Translucent primary fill + stronger primary border (branding §17). Colors are
  // resolved from the --primary token so the overlay inherits the app brand.
  const shapeStyle: google.maps.CircleOptions = {
    fillColor: colors.primary,
    fillOpacity: 0.15,
    strokeColor: colors.primary,
    strokeOpacity: 0.95,
    strokeWeight: 2.5,
    zIndex: 1,
  };

  // ── Free-draw via native map events (circle / rectangle / polygon) ──────────
  // DrawingManager was removed in Maps JS API v3.65, so we wire the interactions
  // by hand: drag to sweep a circle/rectangle; click to drop polygon vertices and
  // double-click (debounced against the trailing click) to finish. Completion
  // emits one AreaDraft; the parent then disarms the tool (drawingMode → 'none'),
  // which tears this effect down and re-renders the shape as an editable overlay.
  useEffect(() => {
    if (!map || !managerActive) return;

    const listeners: google.maps.MapsEventListener[] = [];
    // Remember the map's interaction options so we can restore them afterwards.
    const prevDraggable = map.get('draggable') as boolean | undefined;
    const prevCursor = map.get('draggableCursor') as string | undefined;
    const prevDblZoom = map.get('disableDoubleClickZoom') as boolean | undefined;
    map.setOptions({ draggableCursor: 'crosshair' });

    // Live, in-progress overlays — hoisted so cleanup can always dispose them,
    // even when the mode changes mid-draw.
    let tempCircle: google.maps.Circle | null = null;
    let tempRect: google.maps.Rectangle | null = null;
    let previewLine: google.maps.Polyline | null = null;
    let rubberLine: google.maps.Polyline | null = null;
    let clickTimer: ReturnType<typeof setTimeout> | null = null;

    const strokeOnly: google.maps.PolylineOptions = {
      strokeColor: colors.primary,
      strokeOpacity: 0.95,
      strokeWeight: 2.5,
      clickable: false,
      zIndex: 2,
    };

    // ---- Drag to draw: circle & rectangle ----
    if (drawingMode === 'circle' || drawingMode === 'rectangle') {
      map.setOptions({ draggable: false });
      let start: GeoPoint | null = null;

      listeners.push(
        map.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
          const p = toPoint(e.latLng);
          if (!p) return;
          start = p;
          tempCircle?.setMap(null);
          tempCircle = null;
          tempRect?.setMap(null);
          tempRect = null;
          if (drawingMode === 'circle') {
            tempCircle = new google.maps.Circle({ ...shapeStyle, clickable: false, map, center: p, radius: 1 });
          } else {
            tempRect = new google.maps.Rectangle({
              ...shapeStyle,
              clickable: false,
              map,
              bounds: { north: p.lat, south: p.lat, east: p.lng, west: p.lng },
            });
          }
        }),
      );

      listeners.push(
        map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
          if (!start) return;
          const cur = toPoint(e.latLng);
          if (!cur) return;
          if (tempCircle) {
            tempCircle.setRadius(Math.max(1, haversineDistance(start, cur)));
          } else if (tempRect) {
            tempRect.setBounds({
              north: Math.max(start.lat, cur.lat),
              south: Math.min(start.lat, cur.lat),
              east: Math.max(start.lng, cur.lng),
              west: Math.min(start.lng, cur.lng),
            });
          }
        }),
      );

      const finishDrag = () => {
        if (!start) return;
        if (tempCircle) {
          const c = toPoint(tempCircle.getCenter());
          const r = tempCircle.getRadius();
          tempCircle.setMap(null);
          tempCircle = null;
          start = null;
          if (c && r > 1) emit(circleToAreaDraft(c, r, 'circle')); // r===1 ⇒ a click, not a drag
        } else if (tempRect) {
          const b = tempRect.getBounds();
          tempRect.setMap(null);
          tempRect = null;
          start = null;
          if (b) {
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            if (ne.lat() !== sw.lat() && ne.lng() !== sw.lng()) {
              emit(rectangleToAreaDraft({ north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() }));
            }
          }
        }
      };

      listeners.push(map.addListener('mouseup', finishDrag));
    }

    // ---- Click to draw: polygon ----
    if (drawingMode === 'polygon') {
      map.setOptions({ disableDoubleClickZoom: true });
      const points: GeoPoint[] = [];

      const redraw = () => {
        if (!previewLine) previewLine = new google.maps.Polyline({ ...strokeOnly, map });
        previewLine.setPath(points.map((p) => ({ lat: p.lat, lng: p.lng })));
      };

      const finishPoly = () => {
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        previewLine?.setMap(null);
        previewLine = null;
        rubberLine?.setMap(null);
        rubberLine = null;
        const pts = [...points];
        points.length = 0;
        if (pts.length >= 3) emit(polygonToAreaDraft(pts));
      };

      listeners.push(
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          const p = toPoint(e.latLng);
          if (!p) return;
          // Defer the vertex add so the trailing click of a double-click (which
          // finishes the polygon) does not drop an extra point.
          if (clickTimer) clearTimeout(clickTimer);
          clickTimer = setTimeout(() => {
            clickTimer = null;
            points.push(p);
            redraw();
          }, 240);
        }),
      );

      listeners.push(
        map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
          if (points.length === 0) return;
          const cur = toPoint(e.latLng);
          if (!cur) return;
          if (!rubberLine) {
            rubberLine = new google.maps.Polyline({ ...strokeOnly, strokeOpacity: 0.5, strokeWeight: 2, map });
          }
          const last = points[points.length - 1];
          rubberLine.setPath([
            { lat: last.lat, lng: last.lng },
            { lat: cur.lat, lng: cur.lng },
          ]);
        }),
      );

      listeners.push(map.addListener('dblclick', finishPoly));
    }

    return () => {
      if (clickTimer) clearTimeout(clickTimer);
      listeners.forEach((l) => l.remove());
      tempCircle?.setMap(null);
      tempRect?.setMap(null);
      previewLine?.setMap(null);
      rubberLine?.setMap(null);
      map.setOptions({
        draggable: prevDraggable ?? true,
        draggableCursor: prevCursor ?? null,
        disableDoubleClickZoom: prevDblZoom ?? false,
      });
    };
    // Intentionally stable: only re-create when the map or mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, drawingMode, managerActive]);

  // ── Radius mode: seed a default circle at the current centre if none yet ───
  useEffect(() => {
    if (drawingMode !== 'radius') return;
    if (area && area.type === 'radius' && area.radiusMeters) return;
    const c = areaCenter(area) ?? center;
    emit(circleToAreaDraft(c, area?.radiusMeters ?? DEFAULT_RADIUS_METERS, 'radius'));
  }, [drawingMode, area, center]);

  if (!area?.type) return null;

  const editable = !managerActive;

  // ── Circle / radius ────────────────────────────────────────────────────────
  if (area.type === 'radius' || area.type === 'circle') {
    const circleCenter = areaCenter(area) ?? center;
    const radius = area.radiusMeters ?? DEFAULT_RADIUS_METERS;
    const commitCircle = () => {
      const c = toPoint(circleRef.current?.getCenter());
      const r = circleRef.current?.getRadius();
      if (c && typeof r === 'number') {
        emit(circleToAreaDraft(c, r, area.type === 'circle' ? 'circle' : 'radius'));
      }
    };
    return (
      <Circle
        ref={circleRef}
        center={circleCenter}
        radius={radius}
        editable={editable}
        draggable={editable}
        clickable={editable}
        {...shapeStyle}
        onRadiusChanged={commitCircle}
        onCenterChanged={commitCircle}
        onDragEnd={commitCircle}
      />
    );
  }

  // ── Rectangle ───────────────────────────────────────────────────────────────
  if (area.type === 'rectangle') {
    const bounds = boundsToLiteral(area.bounds);
    if (!bounds) return null;
    const commitRect = () => {
      const b = rectRef.current?.getBounds();
      if (!b) return;
      const ne = b.getNorthEast();
      const sw = b.getSouthWest();
      emit(
        rectangleToAreaDraft({ north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() }),
      );
    };
    return (
      <Rectangle
        ref={rectRef}
        bounds={bounds}
        editable={editable}
        draggable={editable}
        clickable={editable}
        {...shapeStyle}
        onBoundsChanged={commitRect}
        onDragEnd={commitRect}
      />
    );
  }

  // ── Polygon ─────────────────────────────────────────────────────────────────
  if (area.type === 'polygon') {
    const path = geometryToLatLngPath(area.geometry);
    if (path.length < 3) return null;
    const commitPoly = () => {
      const arr = polyRef.current?.getPath().getArray();
      if (!arr || arr.length < 3) return;
      emit(polygonToAreaDraft(arr.map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))));
    };
    return (
      <Polygon
        ref={polyRef}
        paths={path}
        editable={editable}
        draggable={editable}
        clickable={editable}
        {...shapeStyle}
        onPathsChanged={commitPoly}
        onDragEnd={commitPoly}
      />
    );
  }

  return null;
}
