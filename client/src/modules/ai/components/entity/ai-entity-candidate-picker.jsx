'use client';

import { cn } from '@/lib/utils';

export function AiEntityCandidatePicker({ entity, entityKey, selectedId, onSelect }) {
  const entityType = entity.type || entity.entityType;
  const candidates = entity.candidates || [];
  if (candidates.length <= 1) return null;

  return (
    <div className="ml-28 flex flex-wrap gap-1.5 pb-2">
      {candidates.map((c) => (
        <button
          key={String(c.resolvedId)}
          type="button"
          onClick={() => onSelect?.(entityKey, entityType, c)}
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
            selectedId === String(c.resolvedId)
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:bg-muted',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
