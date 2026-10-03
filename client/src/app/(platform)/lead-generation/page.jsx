import { Suspense } from 'react';
import { LeadGenWorkspace } from '@/modules/leadGeneration/ui/lead-gen-workspace';

// The workspace reads the `?detail=` search param (useDrawer → useSearchParams),
// which must sit under a Suspense boundary in the App Router.
function LeadGenFallback() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="skeleton-shimmer h-11 w-11 rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-5 w-40 rounded bg-muted" />
          <div className="skeleton-shimmer h-3 w-64 rounded bg-muted" />
        </div>
      </div>
      <div className="skeleton-shimmer h-14 rounded-xl bg-muted" />
      <div className="skeleton-shimmer min-h-0 flex-1 rounded-xl bg-muted" />
    </div>
  );
}

export default function LeadGenerationPage() {
  return (
    <Suspense fallback={<LeadGenFallback />}>
      <LeadGenWorkspace />
    </Suspense>
  );
}
