'use client';
import { useRef, useEffect, useCallback } from 'react';
import { getSocket } from '@/lib/socket/client';
import { useAuth } from '@/shared/hooks/use-auth';

export function useChatTyping(roomId) {
  const { user } = useAuth();
  const userRef = useRef(user);
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef(null);

  useEffect(() => { userRef.current = user; });

  useEffect(() => {
    return () => clearTimeout(stopTimerRef.current);
  }, []);

  const onKeystroke = useCallback(() => {
    if (!roomId) return;
    const socket = getSocket();
    if (!socket) return;
    const fullName = [userRef.current?.firstName, userRef.current?.lastName].filter(Boolean).join(' ') || 'Unknown';
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('chat:typing', { roomId, userName: fullName });
    }
    clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit('chat:stop typing', { roomId });
    }, 2500);
  }, [roomId]);

  return { onKeystroke };
}
