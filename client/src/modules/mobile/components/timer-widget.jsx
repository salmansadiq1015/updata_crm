'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Timer, Pause, Square } from 'lucide-react';
import { useMobileUIStore } from '../stores/mobile-ui-store';
import { cn } from '@/lib/utils';

export function FloatingTimerWidget() {
  const pathname = usePathname();
  const {
    activeTimerOrderId,
    isTimerRunning,
    timerStartedAt,
    timerActivityType,
  } = useMobileUIStore();

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!timerStartedAt || !activeTimerOrderId) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(timerStartedAt).getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerStartedAt, activeTimerOrderId, isTimerRunning]);

  if (!activeTimerOrderId) return null;

  const isOnTimerPage = pathname?.includes(`/orders/${activeTimerOrderId}/time`);
  if (isOnTimerPage) return null;

  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;

  return (
    <Link href={`/orders/${activeTimerOrderId}/time`}>
      <div
        className={cn(
          'fixed bottom-20 right-4 z-40',
          'flex items-center gap-2 px-3 py-2 rounded-full shadow-lg',
          'border border-border',
          isTimerRunning
            ? 'bg-primary text-primary-foreground'
            : 'bg-amber-500 text-white'
        )}
      >
        <Timer className={cn('h-4 w-4', isTimerRunning && 'animate-pulse')} />
        <span className="text-sm font-mono font-semibold tabular-nums">{display}</span>
        {!isTimerRunning && <Pause className="h-3.5 w-3.5 opacity-70" />}
      </div>
    </Link>
  );
}
