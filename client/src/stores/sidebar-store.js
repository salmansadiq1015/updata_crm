import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSidebarStore = create(
  persist(
    (set) => ({
      isCollapsed: false,
      isMobileOpen: false,
      // Keys of nav groups the user has expanded (accordion). Persisted.
      expandedGroups: [],
      toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (isCollapsed) => set({ isCollapsed }),
      setMobileOpen: (isMobileOpen) => set({ isMobileOpen }),
      toggleMobileOpen: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
      toggleGroup: (key) =>
        set((state) => ({
          expandedGroups: state.expandedGroups.includes(key)
            ? state.expandedGroups.filter((k) => k !== key)
            : [...state.expandedGroups, key],
        })),
    }),
    {
      name: 'mb-sidebar-state',
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        expandedGroups: state.expandedGroups,
      }),
    }
  )
);
