'use client';

import { cn } from '@/lib/utils';

export function FieldOpsChatShell({ sidebar, children }) {
  return (
    <div className={cn(
      'flex -m-4 sm:-m-6',
      'h-[calc(100vh-4rem)]',
      'overflow-hidden border-t'
    )}>
      {/* Left column: conversation list */}
      <div className="w-[280px] shrink-0 border-r flex flex-col overflow-hidden">
        {sidebar}
      </div>

      {/* Right column: message area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
