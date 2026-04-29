'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MobileHeader({ title, showBack = false, right = null, rightAction = null }) {
  const router = useRouter();
  const rightContent = right || rightAction;

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex items-center h-14 px-4',
        'bg-background/95 backdrop-blur-md border-b border-border',
        'pt-[env(safe-area-inset-top)]'
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center h-10 w-10 -ml-2 rounded-lg active:bg-muted transition-colors"
            aria-label="Zurück"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      </div>

      {rightContent && <div className="shrink-0 ml-2">{rightContent}</div>}
    </header>
  );
}
