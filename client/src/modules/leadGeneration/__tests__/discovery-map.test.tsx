import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';

// Mutable, hoisted API-loading status so individual tests can simulate an
// auth/load failure. (vi.mock factories are hoisted above imports.)
const hoisted = vi.hoisted(() => ({ apiStatus: 'LOADED' as string }));

// Mock the Google Maps bindings so nothing touches the network and no real SDK
// script is injected. Mirrors how existing client tests stub modules.
vi.mock('@vis.gl/react-google-maps', async () => {
  const React = await import('react');
  return {
    APIProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'api-provider' }, children),
    Map: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'gmap' }, children),
    AdvancedMarker: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'advanced-marker' }, children),
    Circle: () => null,
    Rectangle: () => null,
    Polygon: () => null,
    Pin: () => null,
    MapControl: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
    ColorScheme: { DARK: 'DARK', LIGHT: 'LIGHT', FOLLOW_SYSTEM: 'FOLLOW_SYSTEM' },
    APILoadingStatus: {
      NOT_LOADED: 'NOT_LOADED',
      LOADING: 'LOADING',
      LOADED: 'LOADED',
      FAILED: 'FAILED',
      AUTH_FAILURE: 'AUTH_FAILURE',
    },
    useApiLoadingStatus: () => hoisted.apiStatus,
    useApiIsLoaded: () => true,
    useMap: () => null,
    useMapsLibrary: () => null,
    useAdvancedMarkerRef: () => [() => {}, null],
    useMarkerRef: () => [() => {}, null],
  };
});

vi.mock('@googlemaps/markerclusterer', () => ({
  MarkerClusterer: class {
    clearMarkers() {}
    addMarkers() {}
    removeMarkers() {}
    render() {}
  },
}));

// Imported AFTER the mocks are registered.
import { DiscoveryMap } from '../ui/discovery-map';
import { DiscoveryMapCanvas } from '../ui/map/discovery-map-canvas';
import {
  circleToAreaDraft,
  destinationPoint,
  haversineDistance,
  polygonToAreaDraft,
  rectangleToAreaDraft,
} from '../ui/map/map-geometry';

const CENTER = { lat: 47.3769, lng: 8.5417 };

function renderWithProviders(ui: ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => {
  window.localStorage.setItem('updata-locale', 'en');
  hoisted.apiStatus = 'LOADED';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DiscoveryMap', () => {
  describe('keyless fallback state', () => {
    it('renders the keyless OpenStreetMap (Leaflet) fallback when the browser key is absent', () => {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '');

      renderWithProviders(<DiscoveryMap center={CENTER} />);

      // A missing Google key is no longer an "unavailable" state: the map still
      // works via OpenStreetMap, with a dismissible note explaining the fallback.
      expect(screen.getByTestId('discovery-map-osm-fallback')).toBeInTheDocument();
      expect(screen.getByTestId('discovery-map-osm-fallback')).toHaveClass('isolate', 'z-0');
      expect(screen.getByTestId('discovery-map-osm-note')).toBeInTheDocument();
      expect(screen.getByTestId('discovery-map-osm-note')).toHaveClass('z-20');
      expect(screen.getByText(/OpenStreetMap/i)).toBeInTheDocument();
      expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
    });
  });

  describe('with a browser key present', () => {
    it('still defaults to the Leaflet/OpenStreetMap path', () => {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', 'test-fake-key');

      expect(() =>
        renderWithProviders(<DiscoveryMap center={CENTER} zoom={12} />),
      ).not.toThrow();

      expect(screen.getByTestId('discovery-map-osm-fallback')).toBeInTheDocument();
      expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
    });

    it('uses Google only when the map provider is explicitly set to google', () => {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', 'test-fake-key');
      vi.stubEnv('NEXT_PUBLIC_LEADGEN_MAP_PROVIDER', 'google');

      renderWithProviders(<DiscoveryMap center={CENTER} zoom={12} />);

      expect(screen.queryByTestId('discovery-map-osm-fallback')).toBeNull();
      expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
    });
  });
});

describe('DiscoveryMapCanvas (mocked SDK)', () => {
  it('renders the map canvas with a fake key without throwing', () => {
    expect(() =>
      renderWithProviders(
        <DiscoveryMapCanvas apiKey="test-fake-key" center={CENTER} zoom={12} results={[]} />,
      ),
    ).not.toThrow();

    expect(screen.getByTestId('discovery-map-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('gmap')).toBeInTheDocument();
  });

  it('renders the error placeholder when the SDK reports an auth failure', () => {
    hoisted.apiStatus = 'AUTH_FAILURE';

    renderWithProviders(
      <DiscoveryMapCanvas apiKey="bad-key" center={CENTER} />,
    );

    const placeholder = screen.getByTestId('discovery-map-unavailable');
    expect(placeholder).toHaveAttribute('data-variant', 'error');
  });
});

describe('map geometry normalization', () => {
  it('circleToAreaDraft emits a closed [lng,lat] ring with radius + bounds', () => {
    const area = circleToAreaDraft(CENTER, 5000, 'radius');
    expect(area.type).toBe('radius');
    expect(area.radiusMeters).toBe(5000);
    expect(area.geometry?.type).toBe('Polygon');

    const ring = area.geometry!.coordinates[0];
    expect(ring.length).toBeGreaterThan(3);
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed ring
    // GeoJSON order is [lng, lat]: first coord ~ lng (8.54), second ~ lat (47.38)
    expect(Math.abs(ring[0][0] - CENTER.lng)).toBeLessThan(1);
    expect(Math.abs(ring[0][1] - CENTER.lat)).toBeLessThan(1);
    expect(area.bounds!.north).toBeGreaterThan(area.bounds!.south);
    expect(area.bounds!.east).toBeGreaterThan(area.bounds!.west);
  });

  it('rectangleToAreaDraft and polygonToAreaDraft produce closed polygons', () => {
    const rect = rectangleToAreaDraft({ north: 47.4, south: 47.3, east: 8.6, west: 8.5 });
    expect(rect.type).toBe('rectangle');
    expect(rect.geometry!.coordinates[0][0]).toEqual(
      rect.geometry!.coordinates[0][rect.geometry!.coordinates[0].length - 1],
    );

    const poly = polygonToAreaDraft([
      { lat: 47.4, lng: 8.5 },
      { lat: 47.4, lng: 8.6 },
      { lat: 47.3, lng: 8.55 },
    ]);
    expect(poly.type).toBe('polygon');
    const ring = poly.geometry!.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // auto-closed
  });

  it('haversineDistance measures the drag radius (round-trips with destinationPoint)', () => {
    // Drives the drag-to-draw circle radius now that DrawingManager is gone.
    expect(haversineDistance(CENTER, CENTER)).toBe(0);
    // Round-trip: a point placed d metres away must measure ~d metres back.
    for (const d of [250, 1000, 5000, 25000]) {
      for (const bearing of [0, 90, 180, 315]) {
        const edge = destinationPoint(CENTER, bearing, d);
        expect(haversineDistance(CENTER, edge)).toBeCloseTo(d, 0); // within <1 m
      }
    }
  });
});
