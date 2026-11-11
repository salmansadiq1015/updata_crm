import { Suspense } from 'react';
import { DocumentsHubPage } from '@/modules/documents/components/documents-hub-page';

// Section and filters live in the URL; useSearchParams must sit under a Suspense boundary.
function DocumentsPageFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-[340px] rounded-[28px] bg-[#060c18]" />
      <div className="skeleton-shimmer h-12 rounded-2xl bg-muted" />
      <div className="skeleton-shimmer h-28 rounded-2xl bg-muted" />
      <div className="skeleton-shimmer h-96 rounded-2xl bg-muted" />
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<DocumentsPageFallback />}>
      <DocumentsHubPage />
    </Suspense>
  );
}
