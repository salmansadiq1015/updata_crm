'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SchedulingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    // Carry the query through: a deep link to an Einsatz arrives here first,
    // and dropping it would land the reader on an empty calendar.
    const query = searchParams.toString();
    router.replace(`/scheduling/calendar${query ? `?${query}` : ''}`);
  }, [router, searchParams]);
  return null;
}

export default function SchedulingPage() {
  return (
    <Suspense fallback={null}>
      <SchedulingRedirect />
    </Suspense>
  );
}
