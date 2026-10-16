import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Online state as TanStack Query sees it (NetInfo-backed, see networkService). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}
