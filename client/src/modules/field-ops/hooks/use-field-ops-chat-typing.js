'use client';

import { useRef, useEffect, useCallback } from 'react';
import { getExistingSocket } from '@/modules/mobile/lib/websocket-client';
import { useAuth } from '@/shared/hooks/use-auth';

export function useFieldOpsChatTyping(projectId) {
  const { user } = useAuth();
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(stopTimerRef.current);
    };
  }, []);

  const onKeystroke = useCallback(() => {
    if (!projectId) return;
    const socket = getExistingSocket();
    if (!socket) return;

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown';

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing', { projectId, user: fullName });
    }

    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('stop typing', { projectId });
    }, 2500);
  }, [projectId, user]);

  return { onKeystroke };
}
