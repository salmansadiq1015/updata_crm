export default function TasksDashboardLoading() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-5 lg:p-6">
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-theme-sm">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary via-sky-400 to-emerald-400" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="h-4 w-36 rounded bg-muted skeleton-shimmer" />
              <div className="h-8 w-56 max-w-full rounded bg-muted skeleton-shimmer" />
              <div className="h-4 w-96 max-w-full rounded bg-muted skeleton-shimmer" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-40 rounded-lg bg-muted skeleton-shimmer" />
              <div className="h-10 w-28 rounded-lg bg-muted skeleton-shimmer" />
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 rounded-xl border border-border bg-card p-4 shadow-theme-sm">
              <div className="h-4 w-28 rounded bg-muted skeleton-shimmer" />
              <div className="mt-4 h-8 w-16 rounded bg-muted skeleton-shimmer" />
              <div className="mt-4 h-3 w-32 rounded bg-muted skeleton-shimmer" />
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
          <div className="h-80 rounded-xl border border-border bg-card p-4 shadow-theme-sm">
            <div className="h-5 w-44 rounded bg-muted skeleton-shimmer" />
            <div className="mt-5 h-56 rounded-lg bg-muted/60 skeleton-shimmer" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="h-40 rounded-xl border border-border bg-card p-4 shadow-theme-sm">
              <div className="h-5 w-40 rounded bg-muted skeleton-shimmer" />
              <div className="mt-5 h-20 rounded-lg bg-muted/60 skeleton-shimmer" />
            </div>
            <div className="h-40 rounded-xl border border-border bg-card p-4 shadow-theme-sm">
              <div className="h-5 w-36 rounded bg-muted skeleton-shimmer" />
              <div className="mt-5 h-20 rounded-lg bg-muted/60 skeleton-shimmer" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-72 rounded-xl border border-border bg-card p-4 shadow-theme-sm">
              <div className="h-5 w-36 rounded bg-muted skeleton-shimmer" />
              <div className="mt-5 space-y-3">
                <div className="h-12 rounded-lg bg-muted/60 skeleton-shimmer" />
                <div className="h-12 rounded-lg bg-muted/60 skeleton-shimmer" />
                <div className="h-12 rounded-lg bg-muted/60 skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
