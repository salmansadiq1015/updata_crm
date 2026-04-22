import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSidebarStore = create(
  persist(
    (set) => ({
      isCollapsed: false,
      isMobileOpen: false,
      toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (isCollapsed) => set({ isCollapsed }),
      setMobileOpen: (isMobileOpen) => set({ isMobileOpen }),
      toggleMobileOpen: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
    }),
    {
      name: 'mb-sidebar-state',
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    }
  )
);
