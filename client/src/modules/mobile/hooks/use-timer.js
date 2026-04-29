'use client';

import { useState, useEffect, useRef } from 'react';
import { useMobileUIStore } from '../stores/mobile-ui-store';

export function useTimer(orderId) {
  const {
    activeTimerOrderId,
    isTimerRunning,
    timerStartedAt,
    timerActivityType,
    breakStartedAt,
    startTimer,
    pauseTimer,
    resumeTimer,
    startBreak,
    stopTimer,
  } = useMobileUIStore();

  const isActiveForThisOrder = activeTimerOrderId === orderId;
  const [elapsed, setElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isActiveForThisOrder && timerStartedAt) {
      const tick = () => {
        const now = Date.now();
        setElapsed(Math.floor((now - new Date(timerStartedAt).getTime()) / 1000));
        if (breakStartedAt) {
          setBreakElapsed(Math.floor((now - new Date(breakStartedAt).getTime()) / 1000));
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => clearInterval(intervalRef.current);
    }
    setElapsed(0);
    setBreakElapsed(0);
  }, [isActiveForThisOrder, timerStartedAt, breakStartedAt, isTimerRunning]);

  return {
    isActive: isActiveForThisOrder,
    isRunning: isTimerRunning,
    elapsed,
    breakElapsed,
    activityType: timerActivityType,
    timerStartedAt,
    breakStartedAt,
    start: (activityType) => startTimer(orderId, activityType),
    pause: pauseTimer,
    resume: resumeTimer,
    startBreak,
    stop: stopTimer,
  };
}
