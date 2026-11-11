import { Suspense } from 'react';
import { FleetPage } from '@/modules/vehicles/components/fleet-page';

// Fleet filters live in the URL; useSearchParams must sit under a Suspense boundary.
function FleetPageFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-[340px] rounded-[28px] bg-[#060c18]" />
      <div className="skeleton-shimmer h-11 rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton-shimmer aspect-[4/3] rounded-2xl bg-muted" />)}
      </div>
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense fallback={<FleetPageFallback />}>
      <FleetPage />
    </Suspense>
  );
}
