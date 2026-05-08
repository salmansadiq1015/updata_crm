'use client';

import { Type } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';

export default function TextBlocksPage() {
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Type}
        title="Text Blocks"
        description="Manage reusable text blocks for quotations and reports"
      />
      <div className="flex-1 rounded-xl border bg-card p-6 flex items-center justify-center text-muted-foreground text-sm">
        Text block management — implemented in Plan 2
      </div>
    </div>
  );
}
