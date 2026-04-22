'use client';

import { useCallback } from 'react';
import { useQueryState, parseAsString } from 'nuqs';

/**
 * Hook for managing detail drawer state with URL sync.
 *
 * Usage:
 *   const drawer = useDrawer('detail');
 *   // URL: /settings/users?detail=abc123
 *   drawer.open('abc123');
 *   drawer.close();
 *   drawer.isOpen; // true when selectedId is set
 */
export function useDrawer(paramName = 'detail') {
  const [selectedId, setSelectedId] = useQueryState(
    paramName,
    parseAsString.withDefault('')
  );

  const open = useCallback(
    (id: string) => {
      void setSelectedId(id);
    },
    [setSelectedId]
  );

  const close = useCallback(() => {
    void setSelectedId(null);
  }, [setSelectedId]);

  return {
    selectedId: selectedId || null,
    isOpen: !!selectedId,
    open,
    close,
  };
}
