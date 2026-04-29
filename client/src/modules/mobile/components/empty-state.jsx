'use client';

import { WifiOff, Inbox, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  empty: { Icon: Inbox, className: 'text-muted-foreground' },
  offline: { Icon: WifiOff, className: 'text-amber-500' },
  error: { Icon: AlertCircle, className: 'text-destructive' },
};

export function EmptyState({
  variant = 'empty',
  title,
  description,
  action,
  className,
}) {
  const { Icon, className: iconClassName } = VARIANTS[variant] || VARIANTS.empty;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className
      )}
    >
      <Icon className={cn('h-12 w-12 mb-4', iconClassName)} />
      {title && (
        <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
