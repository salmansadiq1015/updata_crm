'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { Renderer } from '@googlemaps/markerclusterer';
import { MarkerPin } from './marker-pin';
import type { DiscoveryMapResult } from './types';

type AdvancedMarkerElement = google.maps.marker.AdvancedMarkerElement;

interface ResultMarkersProps {
  results: DiscoveryMapResult[];
  selectedResultId?: string | null;
  hoveredResultId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
}

/**
 * Cluster renderer that keeps clusters on-brand. Built with a raw DOM element so
 * we can use Tailwind token classes (full literal strings -> picked up by the
 * scanner); the count label makes it readable without relying on color alone.
 */
function makeClusterRenderer(): Renderer {
  return {
    render: ({ count, position }) => {
      const el = document.createElement('div');
      el.className =
        'flex items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-theme-md ring-2 ring-background';
      const size = count < 10 ? 34 : count < 100 ? 42 : 52;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.fontSize = count < 100 ? '13px' : '12px';
      el.textContent = String(count);
      el.setAttribute('aria-label', `${count} businesses in this cluster`);
      return new google.maps.marker.AdvancedMarkerElement({
        position,
        content: el,
        zIndex: 1000 + count,
      });
    },
  };
}

export function ResultMarkers({
  results,
  selectedResultId,
  hoveredResultId,
  onMarkerClick,
  onMarkerHover,
}: ResultMarkersProps) {
  const map = useMap();
  // AdvancedMarkerElement + the custom renderer both need the `marker` library.
  const markerLib = useMapsLibrary('marker');
  const [markers, setMarkers] = useState<Record<string, AdvancedMarkerElement>>({});

  const clusterer = useMemo(() => {
    if (!map || !markerLib) return null;
    return new MarkerClusterer({ map, renderer: makeClusterRenderer() });
  }, [map, markerLib]);

  // Re-sync the clusterer only when the SET of marker elements changes — NOT on
  // selection/hover (those just re-render marker content, cheaply).
  useEffect(() => {
    if (!clusterer) return;
    clusterer.clearMarkers(true);
    clusterer.addMarkers(Object.values(markers));
  }, [clusterer, markers]);

  useEffect(
    () => () => {
      clusterer?.clearMarkers();
    },
    [clusterer],
  );

  // One STABLE ref callback per result id. An inline `ref={(m) => setRef(m, id)}`
  // gets a fresh identity on every render, so React detaches (calls with null)
  // and re-attaches the marker on every commit — each cycle mutates `markers`,
  // which re-renders and loops forever ("Maximum update depth exceeded"). Caching
  // a callback per id keeps its identity stable, so React invokes it only on a
  // real mount/unmount. Memoising into a ref during render is safe here: it is an
  // idempotent lazy cache, not reactive state.
  const refCallbacks = useRef(new Map<string, (marker: AdvancedMarkerElement | null) => void>());
  const getMarkerRef = useCallback((id: string) => {
    const cache = refCallbacks.current;
    const existing = cache.get(id);
    if (existing) return existing;
    const cb = (marker: AdvancedMarkerElement | null) => {
      setMarkers((prev) => {
        if (marker) {
          if (prev[id] === marker) return prev;
          return { ...prev, [id]: marker };
        }
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
    cache.set(id, cb);
    return cb;
  }, []);

  return (
    <>
      {results.map((result) => {
        const selected = result.id === selectedResultId;
        const hovered = result.id === hoveredResultId;
        return (
          <AdvancedMarker
            key={result.id}
            position={{ lat: result.lat, lng: result.lng }}
            ref={getMarkerRef(result.id)}
            zIndex={selected ? 3 : hovered ? 2 : 1}
            className="cursor-pointer"
            onClick={() => onMarkerClick?.(result.id)}
            onMouseEnter={() => onMarkerHover?.(result.id)}
            onMouseLeave={() => onMarkerHover?.(null)}
          >
            <MarkerPin status={result.status} selected={selected} hovered={hovered} />
          </AdvancedMarker>
        );
      })}
    </>
  );
}
