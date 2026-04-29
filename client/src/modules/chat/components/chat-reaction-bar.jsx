'use client';

import { cn } from '@/lib/utils';

export function ChatReactionBar({ reactions = [], currentUserId, onToggle }) {
  if (!reactions.length) return null;

  // Group by emoji
  const grouped = reactions.reduce((acc, r) => {
    const key = r.emoji;
    if (!acc[key]) acc[key] = { emoji: key, userIds: [], count: 0 };
    acc[key].userIds.push(String(r.userId));
    acc[key].count += 1;
    return acc;
  }, {});

  const groups = Object.values(grouped).slice(0, 6);
  const overflow = Object.values(grouped).length - 6;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {groups.map(({ emoji, userIds, count }) => {
        const isActive = userIds.includes(String(currentUserId));
        return (
          <button
            key={emoji}
            onClick={() => onToggle?.(emoji)}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
              isActive
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/60 border-border text-muted-foreground hover:bg-muted'
            )}
          >
            <span>{emoji}</span>
            <span className="font-medium">{count}</span>
          </button>
        );
      })}
      {overflow > 0 && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs bg-muted/60 border border-border text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}
