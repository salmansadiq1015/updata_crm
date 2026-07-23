'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Human-readable labels for dynamic breadcrumb segments (object ids).
 *
 * Detail pages already load their entity, so they publish its name here instead
 * of the breadcrumb refetching it. Any id segment without a label is dropped
 * from the trail rather than shown raw — the client should never see an id.
 */
export const useBreadcrumbStore = create((set) => ({
  labels: {},
  setLabel: (id, label) =>
    set((state) => (state.labels[id] === label
      ? state
      : { labels: { ...state.labels, [id]: label } })),
  clearLabel: (id) =>
    set((state) => {
      if (!(id in state.labels)) return state;
      const { [id]: _removed, ...rest } = state.labels;
      return { labels: rest };
    }),
}));

/**
 * Publish the current entity's name for the breadcrumb. Safe to call with
 * undefined values while the entity is still loading.
 */
export function useBreadcrumbLabel(id, label) {
  const setLabel = useBreadcrumbStore((state) => state.setLabel);
  const clearLabel = useBreadcrumbStore((state) => state.clearLabel);

  useEffect(() => {
    const key = id ? String(id) : '';
    const text = typeof label === 'string' ? label.trim() : '';
    if (!key || !text) return undefined;
    setLabel(key, text);
    return () => clearLabel(key);
  }, [id, label, setLabel, clearLabel]);
}

/**
 * Publish a whole ancestry chain for an id segment, e.g. Kunde › Objekt › Anlage.
 * The URL alone cannot express these parent links, so pages that know them
 * expand their id segment into several crumbs.
 *
 * @param {string} id
 * @param {Array<{ label: string, path?: string }>} crumbs
 */
export function useBreadcrumbTrail(id, crumbs) {
  const setLabel = useBreadcrumbStore((state) => state.setLabel);
  const clearLabel = useBreadcrumbStore((state) => state.clearLabel);
  const serialized = JSON.stringify(
    (crumbs || []).filter((crumb) => crumb && typeof crumb.label === 'string' && crumb.label.trim()),
  );

  useEffect(() => {
    const key = id ? String(id) : '';
    const parsed = JSON.parse(serialized);
    if (!key || parsed.length === 0) return undefined;
    setLabel(key, parsed);
    return () => clearLabel(key);
  }, [id, serialized, setLabel, clearLabel]);
}
