'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function IghPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={RefreshCw}
        title="IGH Catalog"
        description="Configure and run IGH industry catalog synchronization"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        IGH management — implemented in Plan 3
      </div>
    </div>
  );
}
