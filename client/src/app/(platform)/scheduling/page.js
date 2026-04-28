'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SchedulingPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/scheduling/calendar');
  }, [router]);
  return null;
}
