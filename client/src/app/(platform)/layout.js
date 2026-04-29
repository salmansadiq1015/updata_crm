'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useDrawerStore } from '@/stores/drawer-store';
import { Sidebar, MobileSidebar } from '@/layout/sidebar';
import { Header } from '@/layout/header';
import { RightDrawer } from '@/layout/right-drawer';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { useKeyboardShortcuts } from '@/shared/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';

export default function PlatformLayout({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const isDrawerOpen = useDrawerStore((s) => s.isOpen);
  const pathname = usePathname();
  const isChatPage = pathname?.includes('/chat');

  useKeyboardShortcuts();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar (Sheet overlay) */}
      <MobileSidebar />

      {/* Main content area */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden min-w-0',
        'transition-all duration-300'
      )}>
        <Header />
        <main className={cn(
          'flex-1 bg-muted/30',
          isChatPage
            ? 'overflow-hidden p-0 flex flex-col'
            : 'overflow-auto p-4 sm:p-6 scrollbar-thin'
        )}>
          {children}
        </main>
      </div>

      {/* Right drawer */}
      <RightDrawer />
    </div>
  );
}
