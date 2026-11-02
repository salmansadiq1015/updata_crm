import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Animated empty-state placeholder. The icon gently floats above a soft pulsing
 * aura so "no data" reads as intentional and on-brand rather than a dead end.
 * Pass a feature-appropriate `icon`, `title` and `description`.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center ', className)}>
      <div className="relative mb-4">
        {/* Pulsing aura */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl"
        />
        {/* Floating icon tile */}
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/15 ">
          <Icon className="h-7 w-7 text-primary/70" />
        </div>
      </div>
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
