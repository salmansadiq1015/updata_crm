import { Skeleton } from '@/components/ui/skeleton';
import { panelClass } from './calling-agent-primitives';

const placeholderClass = 'bg-muted motion-reduce:animate-none';

export function CallingAgentWorkspaceSkeleton() {
  return <div role="status" aria-label="Loading agent" aria-busy="true" className="space-y-5">
    <span className="sr-only">Loading agent…</span>
    <div aria-hidden="true" className="space-y-5">
      <Skeleton className={`${placeholderClass} h-4 w-40`} />
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-sky-400/15 bg-card p-5 sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Skeleton className={`${placeholderClass} size-20 shrink-0 rounded-2xl`} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className={`${placeholderClass} h-7 w-64 max-w-[75%]`} />
              <Skeleton className={`${placeholderClass} h-6 w-14 shrink-0 rounded-full`} />
            </div>
            <Skeleton className={`${placeholderClass} h-4 w-48 max-w-full`} />
            <Skeleton className={`${placeholderClass} h-3 w-full max-w-2xl`} />
          </div>
        </div>
        <div className="w-full space-y-3 sm:w-auto sm:text-end">
          <Skeleton className={`${placeholderClass} h-10 w-32 rounded-xl sm:ms-auto`} />
          <Skeleton className={`${placeholderClass} h-3 w-44`} />
        </div>
      </div>
      <div className="flex gap-7 overflow-hidden border-b border-border px-3.5 py-3">
        {[64, 72, 40, 56, 88, 136, 88, 120].map((width, index) => <Skeleton key={index} className={`${placeholderClass} h-5 shrink-0`} style={{ width }} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(index => <div key={index} className={`${panelClass} space-y-4 !p-4`}>
          <Skeleton className={`${placeholderClass} h-3 w-28 max-w-full`} />
          <Skeleton className={`${placeholderClass} h-8 w-12`} />
        </div>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1].map(index => <div key={index} className={`${panelClass} min-h-60 space-y-5`}>
          <Skeleton className={`${placeholderClass} h-5 w-44 max-w-full`} />
          <Skeleton className={`${placeholderClass} h-4 w-80 max-w-full`} />
          {index === 1 && <Skeleton className={`${placeholderClass} h-20 w-full rounded-xl`} />}
          <Skeleton className={`${placeholderClass} h-10 w-44 max-w-full rounded-xl`} />
        </div>)}
      </div>
      {[0, 1].map(index => <div key={index} className={`${panelClass} space-y-5`}>
        <Skeleton className={`${placeholderClass} h-5 w-32`} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map(metric => <div key={metric} className="space-y-2">
            <Skeleton className={`${placeholderClass} h-3 w-28 max-w-full`} />
            <Skeleton className={`${placeholderClass} h-6 w-20 max-w-full`} />
          </div>)}
        </div>
      </div>)}
    </div>
  </div>;
}
