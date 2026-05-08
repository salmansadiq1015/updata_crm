'use client';

import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function PricesPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={TrendingUp}
        title="Price Management"
        description="Bulk price updates, history, and scheduled changes"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Price management — implemented in Plan 2
      </div>
    </div>
  );
}
