import { Suspense } from 'react';
import { VehicleDetail } from '@/modules/vehicles/components/vehicle-detail';

// The active tab lives in `?tab=`; useSearchParams must sit under a Suspense boundary.
export default function VehicleDetailPage() {
  return (
    <Suspense fallback={<div className="h-[280px] rounded-[28px] bg-[#060c18]" aria-busy="true" />}>
      <VehicleDetail />
    </Suspense>
  );
}
