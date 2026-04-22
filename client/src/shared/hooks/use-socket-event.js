import { useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';

export function useSocketEvent(event, handler) {
  const stableHandler = useCallback(handler, [handler]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(event, stableHandler);
    return () => socket.off(event, stableHandler);
  }, [event, stableHandler]);
}
