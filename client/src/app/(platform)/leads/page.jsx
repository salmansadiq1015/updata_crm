import { Suspense } from 'react';
import { LeadListView } from '@/modules/leads/ui/lead-list-view';

// Placeholder while the client tree that reads the `?detail=` search param is
// resolved (useSearchParams must sit under a Suspense boundary).
function LeadsPageFallback() {
  return (
    <div className="space-y-6 p-4 sm:p-6" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="skeleton-shimmer h-11 w-11 rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="skeleton-shimmer h-5 w-32 rounded bg-muted" />
          <div className="skeleton-shimmer h-3 w-64 rounded bg-muted" />
        </div>
      </div>
      <div className="skeleton-shimmer h-14 rounded-xl bg-muted" />
      <div className="skeleton-shimmer h-72 rounded-xl bg-muted" />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsPageFallback />}>
      <LeadListView />
    </Suspense>
  );
}
