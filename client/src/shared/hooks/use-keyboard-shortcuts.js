'use client';

import { useEffect } from 'react';
import { useSidebarStore } from '@/stores/sidebar-store';

export function useKeyboardShortcuts() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);

  useEffect(() => {
    const handler = (e) => {
      // Ctrl+/ — Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCollapsed]);
}
