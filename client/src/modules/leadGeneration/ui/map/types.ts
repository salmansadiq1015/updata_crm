// Shared prop contracts for the discovery map. The public `DiscoveryMapProps`
// matches the agreed component contract exactly; shapes are imported from the
// module store/types (never redefined).

import type { AreaDraft } from '../../state/lead-gen-store';
import type { AreaBounds, GeoPoint, MatchingStatus } from '../../types/discovery-types';

/**
 * Drawing modes the map understands. Note this differs from the store's
 * `DrawingMode` ('none' | 'circle' | 'rectangle' | 'polygon'): the map contract
 * adds 'radius' and uses `null` for "not drawing". The consuming wizard maps
 * between the two (store 'none' -> null; 'radius' derived from the chosen area type).
 */
export type DiscoveryDrawingMode = 'radius' | 'circle' | 'rectangle' | 'polygon';

export type DiscoveryMapTypeId = 'roadmap' | 'satellite';

/** Minimal marker datum the map renders (a projection of DiscoveryResult). */
export interface DiscoveryMapResult {
  id: string;
  lat: number;
  lng: number;
  status: MatchingStatus; // 'NEW' | 'EXISTING' | 'POSSIBLE_DUPLICATE'
}

export interface DiscoveryMapViewport {
  center: GeoPoint;
  zoom: number;
  bounds?: AreaBounds;
}

export interface DiscoveryMapProps {
  center: GeoPoint;
  zoom?: number;
  /** Current selected area to render. */
  area?: AreaDraft | null;
  drawingMode?: DiscoveryDrawingMode | null;
  /** Fired when the user draws or edits an area. */
  onAreaChange?: (area: AreaDraft) => void;
  results?: DiscoveryMapResult[];
  selectedResultId?: string | null;
  hoveredResultId?: string | null;
  onMarkerClick?: (id: string) => void;
  onMarkerHover?: (id: string | null) => void;
  onViewportChange?: (vp: DiscoveryMapViewport) => void;
  mapTypeId?: DiscoveryMapTypeId;
  className?: string;
}

/** Canvas gets everything the public component does, plus the resolved key. */
export interface DiscoveryMapCanvasProps extends DiscoveryMapProps {
  apiKey: string;
}
