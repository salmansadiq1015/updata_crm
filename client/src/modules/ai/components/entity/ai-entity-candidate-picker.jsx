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
              ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100'
              : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-300/25 hover:bg-white/[0.07]',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
