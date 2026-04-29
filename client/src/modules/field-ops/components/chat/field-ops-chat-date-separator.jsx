'use client';

import { Separator } from '@/components/ui/separator';

export function FieldOpsChatDateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Separator className="flex-1" />
      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
        {label}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}
