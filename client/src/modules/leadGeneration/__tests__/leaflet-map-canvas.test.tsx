import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';

// ── Mock Leaflet so no real DOM map / SVG / canvas renderer is ever created. ──
vi.mock('leaflet', () => {
  const makeMarker = () => ({ on: vi.fn() });
  const makeGroup = () => ({
    addLayer: vi.fn(),
    addLayers: vi.fn(),
    clearLayers: vi.fn(),
    getChildCount: () => 0,
  });
  const L = {
    Icon: { Default: { prototype: {} as Record<string, unknown>, mergeOptions: vi.fn() } },
    divIcon: (options: unknown) => ({ options }),
    marker: () => makeMarker(),
    markerClusterGroup: () => makeGroup(),
    latLngBounds: () => ({
      isValid: () => true,
      getNorth: () => 1,
      getSouth: () => 0,
      getEast: () => 1,
      getWest: () => 0,
    }),
    DomEvent: { stop: vi.fn() },
  };
  return { __esModule: true, default: L, ...L };
});

// Side-effect plugin — nothing to run in the test.
vi.mock('leaflet.markercluster', () => ({}));

// Mock react-leaflet primitives: render plain elements / nulls, expose a stub map.
vi.mock('react-leaflet', async () => {
  const React = await import('react');
  const stubMap = {
    on: vi.fn(),
    off: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setView: vi.fn(),
    getZoom: () => 12,
    getCenter: () => ({ lat: 0, lng: 0 }),
    getBounds: () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 }),
    distance: () => 1000,
    dragging: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
  };
  return {
    MapContainer: ({ children }: { children?: ReactNode }) =>
      React.createElement('div', { 'data-testid': 'leaflet-map-container' }, children),
    TileLayer: () => null,
    Circle: () => null,
    Rectangle: () => null,
    Polygon: () => null,
    Polyline: () => null,
    ZoomControl: () => null,
    useMap: () => stubMap,
    useMapEvents: () => stubMap,
  };
});

// Keep the Google SDK out of the bundle for the key-present path.
vi.mock('@vis.gl/react-google-maps', async () => {
  const React = await import('react');
  return {
    APIProvider: ({ children }: { children?: ReactNode }) =>
      React.createElement('div', null, children),
    Map: ({ children }: { children?: ReactNode }) => React.createElement('div', null, children),
    AdvancedMarker: ({ children }: { children?: ReactNode }) =>
      React.createElement('div', null, children),
    Circle: () => null,
    Rectangle: () => null,
    Polygon: () => null,
    ColorScheme: { DARK: 'DARK', LIGHT: 'LIGHT' },
    APILoadingStatus: { LOADED: 'LOADED', FAILED: 'FAILED', AUTH_FAILURE: 'AUTH_FAILURE' },
    useApiLoadingStatus: () => 'LOADED',
    useMap: () => null,
    useMapsLibrary: () => null,
  };
});

vi.mock('@googlemaps/markerclusterer', () => ({
  MarkerClusterer: class {
    clearMarkers() {}
    addMarkers() {}
  },
}));

// Imported AFTER the mocks are registered.
import { DiscoveryMap } from '../ui/discovery-map';
import { LeafletMapCanvas } from '../ui/map/leaflet-map-canvas';

const CENTER = { lat: 47.3769, lng: 8.5417 };

function renderWithProviders(ui: ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

beforeEach(() => {
  try {
    window.localStorage.setItem('updata-locale', 'en');
  } catch {
    /* ignore */
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('LeafletMapCanvas (mocked Leaflet)', () => {
  it('renders the keyless map canvas without throwing', () => {
    expect(() =>
      renderWithProviders(<LeafletMapCanvas center={CENTER} zoom={12} results={[]} />),
    ).not.toThrow();

    expect(screen.getByTestId('leaflet-map-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-map-container')).toBeInTheDocument();
    // Degraded error placeholder must NOT appear on a normal render.
    expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
  });

  it('renders markers + radius controls without touching a real map', () => {
    expect(() =>
      renderWithProviders(
        <LeafletMapCanvas
          center={CENTER}
          drawingMode="radius"
          area={{
            type: 'radius',
            radiusMeters: 2000,
            geometry: null,
            bounds: null,
          }}
          results={[
            { id: 'a', lat: 47.37, lng: 8.54, status: 'NEW' },
            { id: 'b', lat: 47.38, lng: 8.55, status: 'EXISTING' },
            { id: 'c', lat: 47.39, lng: 8.56, status: 'POSSIBLE_DUPLICATE' },
          ]}
          selectedResultId="a"
          hoveredResultId="b"
        />,
      ),
    ).not.toThrow();

    // Radius slider (from map-controls) renders in radius drawing mode.
    expect(screen.getByLabelText('Radius')).toBeInTheDocument();
    // A keyless map still shows a map-type control (Satellite disabled).
    const satellite = screen.getByRole('button', { name: /satellite/i });
    expect(satellite).toBeDisabled();
  });
});

describe('DiscoveryMap map-provider selection', () => {
  it('uses the keyless Leaflet fallback (with OSM note) when no Google key is set', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '');

    renderWithProviders(<DiscoveryMap center={CENTER} />);

    expect(screen.getByTestId('discovery-map-osm-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('discovery-map-osm-note')).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap/i)).toBeInTheDocument();
    // Missing key is no longer an "unavailable" state — the map works.
    expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
  });

  it('uses the Google path (no OSM note) when a browser key is set', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', 'test-fake-key');

    renderWithProviders(<DiscoveryMap center={CENTER} zoom={12} />);

    expect(screen.queryByTestId('discovery-map-osm-fallback')).toBeNull();
    expect(screen.queryByTestId('discovery-map-osm-note')).toBeNull();
    expect(screen.queryByTestId('discovery-map-unavailable')).toBeNull();
  });
});
