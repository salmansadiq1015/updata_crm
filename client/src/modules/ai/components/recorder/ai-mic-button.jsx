'use client';

import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AiMicButton({ isSupported, onClick, disabled, className }) {
  return (
    <Button
      onClick={onClick}
      disabled={!isSupported || disabled}
      size="lg"
      className={cn(
        'relative h-16 w-16 rounded-full p-0',
        'ring-4 ring-primary/20 transition-all',
        isSupported && !disabled && 'hover:ring-primary/50 active:scale-95',
        className
      )}
      aria-label="Start voice recording"
    >
      <Mic className="h-6 w-6" />
      {!isSupported && (
        <span className="sr-only">Voice not supported on this browser</span>
      )}
    </Button>
  );
}
