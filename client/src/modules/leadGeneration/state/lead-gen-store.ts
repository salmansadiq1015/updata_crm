'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  AreaBounds,
  AreaType,
  DiscoveryResultFilters,
  GeoJsonPolygon,
  GeoPoint,
  ImportStatus,
  LocationMode,
  MatchingStatus,
} from '../types/discovery-types';

export type WizardStep = 0 | 1 | 2 | 3;

export type DrawingMode = 'none' | 'circle' | 'rectangle' | 'polygon';

export type LocationDraft = {
  name: string;
  mode: LocationMode;
  center: GeoPoint | null;
  country: string | null;
  region: string | null;
  city: string | null;
  countryCode: string | null;
  formattedAddress: string | null;
  placeId: string | null;
};

export type AreaDraft = {
  type: AreaType | null;
  geometry: GeoJsonPolygon | null;
  radiusMeters: number | null;
  bounds: AreaBounds | null;
};

export type MapViewport = {
  center: GeoPoint | null;
  zoom: number;
};

export type LeadGenFilters = Required<
  Pick<DiscoveryResultFilters, 'minRating' | 'hasPhone' | 'hasWebsite' | 'search'>
> & {
  crmStatus: MatchingStatus | 'ALL';
  importStatus: ImportStatus | 'ALL';
};

export type LeadGenSort = {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

const INITIAL_LOCATION: LocationDraft = {
  name: '',
  mode: 'search',
  center: null,
  country: null,
  region: null,
  city: null,
  countryCode: 'CH',
  formattedAddress: null,
  placeId: null,
};

const INITIAL_AREA: AreaDraft = {
  type: null,
  geometry: null,
  radiusMeters: null,
  bounds: null,
};

const INITIAL_FILTERS: LeadGenFilters = {
  crmStatus: 'ALL',
  importStatus: 'ALL',
  minRating: 0,
  hasPhone: false,
  hasWebsite: false,
  search: '',
};

const INITIAL_SORT: LeadGenSort = { sortBy: 'discoveredAt', sortOrder: 'desc' };

const INITIAL_VIEWPORT: MapViewport = { center: null, zoom: 12 };

type LeadGenState = {
  // Wizard
  step: WizardStep;
  locationDraft: LocationDraft;
  areaDraft: AreaDraft;
  selectedBusinessTypes: string[];
  keyword: string;
  // Results workspace
  filters: LeadGenFilters;
  sort: LeadGenSort;
  rowSelection: Record<string, boolean>;
  selectedResultId: string | null;
  hoveredResultId: string | null;
  // Map
  mapViewport: MapViewport;
  drawingMode: DrawingMode;
  // Detail drawer
  drawerOpen: boolean;

  // Wizard setters
  setStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setLocationDraft: (patch: Partial<LocationDraft>) => void;
  setAreaDraft: (patch: Partial<AreaDraft>) => void;
  setSelectedBusinessTypes: (ids: string[]) => void;
  toggleBusinessType: (id: string) => void;
  setKeyword: (keyword: string) => void;
  resetWizard: () => void;

  // Results setters
  setFilters: (patch: Partial<LeadGenFilters>) => void;
  clearFilters: () => void;
  setSort: (sort: LeadGenSort) => void;
  setRowSelection: (selection: Record<string, boolean>) => void;
  toggleRow: (id: string) => void;
  clearSelection: () => void;
  setSelectedResultId: (id: string | null) => void;
  setHoveredResultId: (id: string | null) => void;

  // Map setters
  setMapViewport: (patch: Partial<MapViewport>) => void;
  setDrawingMode: (mode: DrawingMode) => void;

  // Drawer setters
  setDrawerOpen: (open: boolean) => void;
  openResult: (id: string) => void;
  closeDrawer: () => void;

  // Full reset
  reset: () => void;
};

export const useLeadGenStore = create<LeadGenState>((set) => ({
  step: 0,
  locationDraft: INITIAL_LOCATION,
  areaDraft: INITIAL_AREA,
  selectedBusinessTypes: [],
  keyword: '',
  filters: INITIAL_FILTERS,
  sort: INITIAL_SORT,
  rowSelection: {},
  selectedResultId: null,
  hoveredResultId: null,
  mapViewport: INITIAL_VIEWPORT,
  drawingMode: 'none',
  drawerOpen: false,

  setStep: (step) => set({ step }),
  nextStep: () => set((state) => ({ step: Math.min(3, state.step + 1) as WizardStep })),
  prevStep: () => set((state) => ({ step: Math.max(0, state.step - 1) as WizardStep })),
  setLocationDraft: (patch) =>
    set((state) => ({ locationDraft: { ...state.locationDraft, ...patch } })),
  setAreaDraft: (patch) => set((state) => ({ areaDraft: { ...state.areaDraft, ...patch } })),
  setSelectedBusinessTypes: (selectedBusinessTypes) => set({ selectedBusinessTypes }),
  toggleBusinessType: (id) =>
    set((state) => ({
      selectedBusinessTypes: state.selectedBusinessTypes.includes(id)
        ? state.selectedBusinessTypes.filter((item) => item !== id)
        : [...state.selectedBusinessTypes, id],
    })),
  setKeyword: (keyword) => set({ keyword }),
  resetWizard: () =>
    set({
      step: 0,
      locationDraft: INITIAL_LOCATION,
      areaDraft: INITIAL_AREA,
      selectedBusinessTypes: [],
      keyword: '',
      drawingMode: 'none',
    }),

  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  clearFilters: () => set({ filters: INITIAL_FILTERS }),
  setSort: (sort) => set({ sort }),
  setRowSelection: (rowSelection) => set({ rowSelection }),
  toggleRow: (id) =>
    set((state) => {
      const next = { ...state.rowSelection };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { rowSelection: next };
    }),
  clearSelection: () => set({ rowSelection: {} }),
  setSelectedResultId: (selectedResultId) => set({ selectedResultId }),
  setHoveredResultId: (hoveredResultId) => set({ hoveredResultId }),

  setMapViewport: (patch) => set((state) => ({ mapViewport: { ...state.mapViewport, ...patch } })),
  setDrawingMode: (drawingMode) => set({ drawingMode }),

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  openResult: (id) => set({ selectedResultId: id, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),

  reset: () =>
    set({
      step: 0,
      locationDraft: INITIAL_LOCATION,
      areaDraft: INITIAL_AREA,
      selectedBusinessTypes: [],
      keyword: '',
      filters: INITIAL_FILTERS,
      sort: INITIAL_SORT,
      rowSelection: {},
      selectedResultId: null,
      hoveredResultId: null,
      mapViewport: INITIAL_VIEWPORT,
      drawingMode: 'none',
      drawerOpen: false,
    }),
}));

// ── Selector hooks (useShallow) ───────────────────────────────────────────────

export const useLeadGenWizard = () =>
  useLeadGenStore(
    useShallow((state) => ({
      step: state.step,
      locationDraft: state.locationDraft,
      areaDraft: state.areaDraft,
      selectedBusinessTypes: state.selectedBusinessTypes,
      keyword: state.keyword,
      setStep: state.setStep,
      nextStep: state.nextStep,
      prevStep: state.prevStep,
      setLocationDraft: state.setLocationDraft,
      setAreaDraft: state.setAreaDraft,
      setSelectedBusinessTypes: state.setSelectedBusinessTypes,
      toggleBusinessType: state.toggleBusinessType,
      setKeyword: state.setKeyword,
      resetWizard: state.resetWizard,
    })),
  );

export const useLeadGenFilters = () =>
  useLeadGenStore(
    useShallow((state) => ({
      filters: state.filters,
      sort: state.sort,
      setFilters: state.setFilters,
      clearFilters: state.clearFilters,
      setSort: state.setSort,
    })),
  );

export const useSelectedResultIds = () =>
  useLeadGenStore(
    useShallow((state) => Object.keys(state.rowSelection).filter((id) => state.rowSelection[id])),
  );

export const useLeadGenRowSelection = () => useLeadGenStore((state) => state.rowSelection);

export const useLeadGenMapSync = () =>
  useLeadGenStore(
    useShallow((state) => ({
      selectedResultId: state.selectedResultId,
      hoveredResultId: state.hoveredResultId,
      mapViewport: state.mapViewport,
      drawingMode: state.drawingMode,
      drawerOpen: state.drawerOpen,
      setSelectedResultId: state.setSelectedResultId,
      setHoveredResultId: state.setHoveredResultId,
      setMapViewport: state.setMapViewport,
      setDrawingMode: state.setDrawingMode,
      openResult: state.openResult,
      closeDrawer: state.closeDrawer,
    })),
  );
