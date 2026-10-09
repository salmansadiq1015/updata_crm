import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  useLeadGenStore,
  useSelectedResultIds,
} from '../state/lead-gen-store';

const store = () => useLeadGenStore.getState();

beforeEach(() => {
  store().reset();
});

describe('lead-gen-store', () => {
  describe('wizard transitions', () => {
    it('starts at step 0', () => {
      expect(store().step).toBe(0);
    });

    it('nextStep advances and caps at 3', () => {
      store().nextStep();
      expect(store().step).toBe(1);
      store().nextStep();
      store().nextStep();
      store().nextStep();
      store().nextStep();
      expect(store().step).toBe(3);
    });

    it('prevStep decrements and floors at 0', () => {
      store().setStep(2);
      store().prevStep();
      expect(store().step).toBe(1);
      store().prevStep();
      store().prevStep();
      expect(store().step).toBe(0);
    });

    it('resetWizard restores wizard defaults but is independent of filters', () => {
      store().setStep(3);
      store().setKeyword('pizza');
      store().setSelectedBusinessTypes(['restaurant']);
      store().resetWizard();
      expect(store().step).toBe(0);
      expect(store().keyword).toBe('');
      expect(store().selectedBusinessTypes).toEqual([]);
    });
  });

  describe('business type selection', () => {
    it('toggleBusinessType adds then removes an id', () => {
      store().toggleBusinessType('restaurant');
      expect(store().selectedBusinessTypes).toEqual(['restaurant']);
      store().toggleBusinessType('hotel');
      expect(store().selectedBusinessTypes).toEqual(['restaurant', 'hotel']);
      store().toggleBusinessType('restaurant');
      expect(store().selectedBusinessTypes).toEqual(['hotel']);
    });
  });

  describe('location / area drafts', () => {
    it('starts without a country bias so worldwide searches are neutral', () => {
      expect(store().locationDraft.countryCode).toBeNull();
    });

    it('setLocationDraft merges partial updates', () => {
      store().setLocationDraft({ name: 'Zürich', center: { lat: 47.37, lng: 8.54 } });
      expect(store().locationDraft.name).toBe('Zürich');
      expect(store().locationDraft.center).toEqual({ lat: 47.37, lng: 8.54 });
      // mode untouched
      expect(store().locationDraft.mode).toBe('search');
    });

    it('setAreaDraft merges partial updates', () => {
      store().setAreaDraft({ type: 'radius', radiusMeters: 1500 });
      expect(store().areaDraft.type).toBe('radius');
      expect(store().areaDraft.radiusMeters).toBe(1500);
    });
  });

  describe('row selection', () => {
    it('toggleRow selects and deselects', () => {
      store().toggleRow('a');
      store().toggleRow('b');
      expect(store().rowSelection).toEqual({ a: true, b: true });
      store().toggleRow('a');
      expect(store().rowSelection).toEqual({ b: true });
    });

    it('clearSelection empties the selection', () => {
      store().setRowSelection({ a: true, b: true });
      store().clearSelection();
      expect(store().rowSelection).toEqual({});
    });

    it('useSelectedResultIds returns only selected ids', () => {
      store().setRowSelection({ a: true, b: false, c: true });
      const { result } = renderHook(() => useSelectedResultIds());
      expect(result.current.sort()).toEqual(['a', 'c']);
    });
  });

  describe('filters + drawer', () => {
    it('setFilters merges and clearFilters resets', () => {
      store().setFilters({ minRating: 4, hasPhone: true });
      expect(store().filters.minRating).toBe(4);
      expect(store().filters.hasPhone).toBe(true);
      store().clearFilters();
      expect(store().filters.minRating).toBe(0);
      expect(store().filters.hasPhone).toBe(false);
      expect(store().filters.crmStatus).toBe('ALL');
    });

    it('openResult selects a result and opens the drawer', () => {
      store().openResult('res-7');
      expect(store().selectedResultId).toBe('res-7');
      expect(store().drawerOpen).toBe(true);
      store().closeDrawer();
      expect(store().drawerOpen).toBe(false);
    });
  });
});
