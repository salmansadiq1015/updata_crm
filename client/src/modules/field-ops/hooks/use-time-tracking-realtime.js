'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSocketConnect } from '@/lib/socket/client';
import { queryKeys } from '@/lib/query/keys';

export function useTimeTrackingRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let activeSocket = null;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.timeTracking.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.deploy.all() });
    };

    const attach = (socket) => {
      if (!socket) return;
      if (activeSocket && activeSocket !== socket) {
        activeSocket.off('time-tracking:updated', invalidate);
        activeSocket.emit('time-tracking:unsubscribe');
      }
      activeSocket = socket;
      socket.emit('time-tracking:subscribe');
      socket.off('time-tracking:updated', invalidate);
      socket.on('time-tracking:updated', invalidate);
    };

    const unsubscribeConnect = onSocketConnect(attach);

    return () => {
      unsubscribeConnect();
      if (activeSocket) {
        activeSocket.off('time-tracking:updated', invalidate);
        activeSocket.emit('time-tracking:unsubscribe');
      }
    };
  }, [queryClient]);
}
