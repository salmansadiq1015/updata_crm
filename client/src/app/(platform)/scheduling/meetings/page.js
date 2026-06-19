import { Suspense } from 'react';
import { MeetingWorkspace } from '@/modules/meetings/components/meeting-workspace';

function MeetingsFallback() {
  return (
    <div className="p-4 lg:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.42fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="h-24 rounded-lg bg-muted animate-pulse" />
          <div className="h-[520px] rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-[620px] rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsFallback />}>
      <MeetingWorkspace />
    </Suspense>
  );
}
