import { NuqsAdapter } from 'nuqs/adapters/next/app';

// Full-height shell, like /tasks: the leads page manages its own scrolling, so
// the platform layout's content padding is cancelled out here.
//
// NuqsAdapter: the list's detail drawer keeps the open lead in the `?detail=`
// URL param through `useDrawer` (nuqs), and nuqs refuses to run without an
// adapter. None is mounted app-wide yet, so it is provided for this route.
// (Mounting it once in AppProviders would make it available everywhere; a
// nested adapter like this one is harmless next to it.)
export default function LeadsLayout({ children }) {
  return (
    <div className="-m-4 h-[calc(100%+2rem)] min-h-0 overflow-hidden sm:-m-6 sm:h-[calc(100%+3rem)]">
      <NuqsAdapter>{children}</NuqsAdapter>
    </div>
  );
}
