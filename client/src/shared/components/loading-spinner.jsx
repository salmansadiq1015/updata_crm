'use client';

import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

export function LoadingSpinner({ className, size = 'default' }) {
  const sizeClass = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  const ringSize = { sm: 'h-8 w-8', default: 'h-12 w-12', lg: 'h-20 w-20' }[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative">
        <div className={cn('rounded-full border-2 border-muted border-t-primary animate-spin', ringSize)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className={cn('text-primary', sizeClass)} />
        </div>
      </div>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-300">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative h-16 w-16">
            <svg className="h-16 w-16 animate-spin" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="var(--muted)" strokeWidth="3" />
              <path
                d="M32 4a28 28 0 0 1 28 28"
                stroke="url(#spinner-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="oklch(0.546 0.245 292)" />
                  <stop offset="100%" stopColor="oklch(0.65 0.22 292)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-9 w-9 rounded-xl bg-primary-gradient flex items-center justify-center shadow-theme-md">
                <Zap className="h-4.5 w-4.5 text-white" />
              </div>
            </div>
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">MB Boiler <span className="text-primary">ERP</span></p>
          <p className="text-xs text-muted-foreground animate-pulse">Laden...</p>
        </div>
      </div>
    </div>
  );
}
