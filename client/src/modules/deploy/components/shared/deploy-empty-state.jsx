'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export function DeployEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  compact = false,
}) {
  return (
    <div className={cn(
      'relative flex flex-col items-center justify-center text-center overflow-hidden select-none',
      compact ? 'py-8' : 'py-16',
      className
    )}>
      {/* Decorative background rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-[300px] w-[300px] rounded-full border border-primary/[0.04]" />
        <div className="absolute h-[220px] w-[220px] rounded-full border border-primary/[0.06]" />
        <div className="absolute h-[140px] w-[140px] rounded-full border border-primary/[0.08]" />
      </div>

      {/* Icon with animations */}
      <div className="relative mb-5">
        {/* Glow pulse */}
        <div className="absolute inset-[-8px] rounded-3xl bg-primary/15 blur-xl animate-pulse-glow" />

        {/* Floating icon container */}
        <div className={cn(
          'relative flex items-center justify-center rounded-2xl animate-float-subtle',
          'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent',
          'border border-primary/15 shadow-sm shadow-primary/5',
          compact ? 'h-14 w-14' : 'h-[72px] w-[72px]',
        )}>
          <Icon className={cn(
            'text-primary/70',
            compact ? 'h-7 w-7' : 'h-9 w-9',
          )} />
        </div>

        {/* Orbiting dot */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/30 animate-orbit" />
        </div>
      </div>

      {/* Title */}
      <h3 className={cn(
        'font-semibold tracking-tight text-foreground',
        compact ? 'text-sm' : 'text-base',
      )}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={cn(
          'mt-1.5 text-muted-foreground max-w-xs leading-relaxed',
          compact ? 'text-xs' : 'text-sm',
        )}>
          {description}
        </p>
      )}

      {/* CTA button */}
      {actionLabel && onAction && (
        <Button
          size={compact ? 'sm' : 'default'}
          className="mt-5 gap-1.5"
          onClick={onAction}
        >
          <Plus className="h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
