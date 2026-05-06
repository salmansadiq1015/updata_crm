'use client';

export function TaskListSkeleton() {
  return (
    <div className="space-y-1 p-3">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="grid h-10 grid-cols-[minmax(240px,1fr)_120px_110px_120px_120px] gap-3 border-b border-border px-3 py-2">
          <div className="h-4 rounded bg-muted skeleton-shimmer" />
          <div className="h-4 rounded bg-muted skeleton-shimmer" />
          <div className="h-4 rounded bg-muted skeleton-shimmer" />
          <div className="h-4 rounded bg-muted skeleton-shimmer" />
          <div className="h-4 rounded bg-muted skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

export function TaskBoardSkeleton() {
  return (
    <div className="grid h-full grid-cols-4 gap-3 p-3">
      {Array.from({ length: 4 }).map((_, column) => (
        <div key={column} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-3 h-5 w-28 rounded bg-muted skeleton-shimmer" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, card) => (
              <div key={card} className="h-24 rounded-lg border border-border bg-card p-3">
                <div className="mb-3 h-4 rounded bg-muted skeleton-shimmer" />
                <div className="h-3 w-2/3 rounded bg-muted skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

