'use client';

import { Ruler } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function UnitsPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Ruler}
        title="Units of Measure"
        description="Configure measurement units used across the catalog"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Unit management — implemented in Plan 2
      </div>
    </div>
  );
}
