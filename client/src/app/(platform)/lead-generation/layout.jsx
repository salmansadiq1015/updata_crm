import { NuqsAdapter } from 'nuqs/adapters/next/app';

// Full-height shell, like /tasks and /leads: the workspace owns its own
// scrolling, so the platform layout's content padding is cancelled out here.
//
// NuqsAdapter: the result detail drawer keeps the open business in the `?detail=`
// URL param through `useDrawer` (nuqs), which refuses to run without an adapter.
export default function LeadGenerationLayout({ children }) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      <NuqsAdapter>{children}</NuqsAdapter>
    </div>
  );
}
