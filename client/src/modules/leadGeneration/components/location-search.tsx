'use client';

// Location picker for the wizard's first step. Three tabs:
//  - Search : debounced autocomplete (discoveryApi.autocomplete) → geocode resolve
//  - Draw   : hint to use the area-shape controls / draw on the map
//  - Upload : parse a GeoJSON / KML boundary file into an AreaDraft
//
// Writes `locationDraft` + `areaDraft` to the store. Server calls go through the
// discovery service (not apiClient) wrapped in TanStack Query.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock, Loader2, MapPin, PenLine, Search, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { showError } from '@/lib/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { discoveryApi } from '../services/discovery-api';
import type { AutocompletePrediction, GeoPoint, LocationMode } from '../types/discovery-types';
import type { AreaDraft } from '../state/lead-gen-store';
import { useLeadGenWizard, useLeadGenMapSync } from '../state/lead-gen-store';
import {
  areaCenter,
  circleToAreaDraft,
  DEFAULT_RADIUS_METERS,
  polygonToAreaDraft,
} from '../ui/map/map-geometry';

const RECENT_KEY = 'updata-leadgen-recent-searches';
const MAX_RECENT = 5;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function toIsoCountryCode(value: string | null | undefined): string | null {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecent(next: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    /* storage blocked — ignore */
  }
}

// ── Boundary-file parsing ────────────────────────────────────────────────────

function ringToPoints(ring: unknown): GeoPoint[] {
  if (!Array.isArray(ring)) return [];
  return ring
    .map((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return null;
      const [lng, lat] = pair;
      return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
    })
    .filter((point): point is GeoPoint => point !== null);
}

function findFirstPolygonRing(node: unknown): GeoPoint[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    for (const feature of obj.features) {
      const ring = findFirstPolygonRing(feature);
      if (ring.length) return ring;
    }
  }
  if (obj.type === 'Feature') return findFirstPolygonRing(obj.geometry);
  if (obj.type === 'Polygon' && Array.isArray(obj.coordinates)) return ringToPoints(obj.coordinates[0]);
  if (obj.type === 'MultiPolygon' && Array.isArray(obj.coordinates)) {
    const first = obj.coordinates[0];
    if (Array.isArray(first)) return ringToPoints(first[0]);
  }
  return [];
}

function parseBoundaryFile(name: string, text: string): AreaDraft | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.kml') || text.trimStart().startsWith('<')) {
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const coords =
        doc.querySelector('Polygon coordinates')?.textContent ??
        doc.querySelector('coordinates')?.textContent;
      if (!coords) return null;
      const points = coords
        .trim()
        .split(/\s+/)
        .map((token) => {
          const [lng, lat] = token.split(',').map(Number);
          return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        })
        .filter((point): point is GeoPoint => point !== null);
      return points.length >= 3 ? polygonToAreaDraft(points) : null;
    } catch {
      return null;
    }
  }
  try {
    const points = findFirstPolygonRing(JSON.parse(text));
    return points.length >= 3 ? polygonToAreaDraft(points) : null;
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function LocationSearch() {
  const { t } = useLanguage();
  const { locationDraft, areaDraft, setLocationDraft, setAreaDraft } = useLeadGenWizard();
  const { setMapViewport } = useLeadGenMapSync();

  const [query, setQuery] = useState(locationDraft.name ?? '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolveRequestRef = useRef(0);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    // Browser-only history must hydrate after mount so the server/client first
    // render stays identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent());
  }, []);

  const countryCode = locationDraft.countryCode ?? undefined;
  const trimmed = debouncedQuery.trim();

  const predictionsQuery = useQuery({
    queryKey: ['leadgen', 'autocomplete', trimmed, countryCode],
    queryFn: () => discoveryApi.autocomplete({ query: trimmed, countryCode }),
    enabled: trimmed.length >= 2 && showSuggestions,
    staleTime: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (value: string) => discoveryApi.geocode({ query: value, countryCode }),
  });

  const applyCenter = useCallback(
    (center: GeoPoint, meta: {
      name?: string | null;
      formattedAddress?: string | null;
      placeId?: string | null;
      countryCode?: string | null;
      country?: string | null;
      region?: string | null;
      city?: string | null;
    }) => {
      setLocationDraft({
        name: meta.name ?? '',
        mode: 'search',
        center,
        formattedAddress: meta.formattedAddress ?? null,
        placeId: meta.placeId ?? null,
        countryCode: toIsoCountryCode(meta.countryCode),
        country: meta.country ?? null,
        region: meta.region ?? null,
        city: meta.city ?? null,
      });
      // Seed / re-anchor a sensible default radius so the next step is reachable.
      if (!areaDraft.type || areaDraft.type === 'radius') {
        setAreaDraft(circleToAreaDraft(center, areaDraft.radiusMeters ?? DEFAULT_RADIUS_METERS, 'radius'));
      }
      setMapViewport({ center, zoom: 13 });
    },
    [areaDraft.radiusMeters, areaDraft.type, setAreaDraft, setLocationDraft, setMapViewport],
  );

  const resolveAndApply = useCallback(
    async (value: string) => {
      const label = value.trim();
      if (!label) return;
      const requestId = ++resolveRequestRef.current;
      setShowSuggestions(false);
      setQuery(label);
      try {
        const results = await resolveMutation.mutateAsync(label);
        // A slower response for an older location must never replace a newer
        // choice (e.g. Lahore resolving after the user already picked Paris).
        if (requestId !== resolveRequestRef.current) return;
        const geo = results[0];
        if (!geo?.center) {
          showError(t('leadgen.location.search.noResults', 'No matching places'));
          return;
        }
        applyCenter(geo.center, {
          name: geo.name ?? label,
          formattedAddress: geo.formattedAddress,
          placeId: geo.placeId,
          countryCode: geo.countryCode,
          country: geo.country,
          region: geo.region,
          city: geo.city,
        });
        const next = [label, ...recent.filter((item) => item !== label)];
        setRecent(next);
        writeRecent(next);
      } catch (error) {
        if (requestId !== resolveRequestRef.current) return;
        showError(error);
      }
    },
    [applyCenter, recent, resolveMutation, t],
  );

  const handlePick = (prediction: AutocompletePrediction) => {
    void resolveAndApply(prediction.description);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showError(t('leadgen.location.upload.error', 'The boundary file could not be read.'));
      return;
    }
    try {
      const text = await file.text();
      const area = parseBoundaryFile(file.name, text);
      if (!area) {
        showError(t('leadgen.location.upload.error', 'The boundary file could not be read.'));
        return;
      }
      setAreaDraft(area);
      const center = areaCenter(area);
      setLocationDraft({
        name: file.name.replace(/\.[^.]+$/, ''),
        mode: 'upload',
        center,
        placeId: null,
        countryCode: null,
        country: null,
        region: null,
        city: null,
        formattedAddress: null,
      });
      if (center) setMapViewport({ center, zoom: 12 });
    } catch {
      showError(t('leadgen.location.upload.error', 'The boundary file could not be read.'));
    }
  };

  const predictions = predictionsQuery.data ?? [];
  const isResolving = resolveMutation.isPending;

  return (
    <Tabs
      value={locationDraft.mode}
      onValueChange={(value: string) => setLocationDraft({ mode: value as LocationMode })}
      className="w-full"
    >
      <TabsList className="w-full justify-start">
        <TabsTrigger value="search" className="gap-1.5">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.location.tab.search', 'Search')}
        </TabsTrigger>
        <TabsTrigger value="draw" className="gap-1.5">
          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.location.tab.draw', 'Draw area')}
        </TabsTrigger>
        <TabsTrigger value="upload" className="gap-1.5">
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          {t('leadgen.location.tab.upload', 'Upload')}
        </TabsTrigger>
      </TabsList>

      {/* ── Search ── */}
      <TabsContent value="search" className="mt-3 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              resolveRequestRef.current += 1;
              setQuery(value);
              // Text and coordinates are one configuration. Once the text no
              // longer names the resolved place, invalidate all old metadata
              // and the old area so Start cannot combine Paris text with a
              // Lahore/previous-city center.
              if (value.trim() !== locationDraft.name.trim()) {
                setLocationDraft({
                  name: value,
                  center: null,
                  formattedAddress: null,
                  placeId: null,
                  countryCode: null,
                  country: null,
                  region: null,
                  city: null,
                });
                setAreaDraft({ type: null, geometry: null, radiusMeters: null, bounds: null });
              }
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void resolveAndApply(query);
              }
            }}
            placeholder={t('leadgen.location.search.placeholder', 'Search for a city, address or place')}
            aria-label={t('leadgen.location.search.placeholder', 'Search for a city, address or place')}
            className="ps-9 pe-9"
          />
          {(predictionsQuery.isFetching || isResolving) && (
            <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {query && !predictionsQuery.isFetching && !isResolving && (
            <button
              type="button"
              onClick={() => {
                resolveRequestRef.current += 1;
                setQuery('');
                setShowSuggestions(false);
                setLocationDraft({ name: '', center: null, formattedAddress: null, placeId: null, countryCode: null, country: null, region: null, city: null });
                setAreaDraft({ type: null, geometry: null, radiusMeters: null, bounds: null });
              }}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={t('leadgen.location.clear', 'Clear')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {showSuggestions && trimmed.length >= 2 && (
          <ul className="overflow-hidden rounded-lg border border-border bg-card" role="listbox" aria-label={t('leadgen.location.tab.search', 'Search')}>
            {predictions.length === 0 && !predictionsQuery.isFetching ? (
              <li className="px-3 py-2.5 text-xs text-muted-foreground">
                {t('leadgen.location.search.noResults', 'No matching places')}
              </li>
            ) : (
              predictions.map((prediction) => (
                <li key={prediction.placeId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handlePick(prediction)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {prediction.mainText ?? prediction.description}
                      </span>
                      {prediction.secondaryText && (
                        <span className="block truncate text-xs text-muted-foreground">{prediction.secondaryText}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {!showSuggestions && recent.length > 0 && (
          <div className="space-y-1">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {t('leadgen.location.search.hint', 'Recent searches')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void resolveAndApply(item)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </TabsContent>

      {/* ── Draw ── */}
      <TabsContent value="draw" className="mt-3">
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
          {t('leadgen.location.draw.hint', 'Pick a shape below, then draw the area directly on the map.')}
        </p>
      </TabsContent>

      {/* ── Upload ── */}
      <TabsContent value="upload" className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{t('leadgen.location.upload.cta', 'Choose a file')}</span>
          <span className="text-xs text-muted-foreground">{t('leadgen.location.upload.formats', 'Supported formats: GeoJSON, KML')}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
          className="sr-only"
          onChange={handleFile}
        />
        <p className="text-xs text-muted-foreground">{t('leadgen.location.upload.hint', 'Upload a boundary file to set the search area.')}</p>
      </TabsContent>
    </Tabs>
  );
}
