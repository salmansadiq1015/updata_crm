'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarView } from '@/modules/deploy/components/calendar/calendar-view';

function CalendarPageInner() {
  // The assistant links straight to an Einsatz; open its drawer on arrival.
  const searchParams = useSearchParams();
  return <CalendarView focusId={searchParams.get('assignmentId')} />;
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}
