'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDrawerStore } from '@/stores/drawer-store';
import { cn } from '@/lib/utils';

export function RightDrawer() {
  const { isOpen, title, content, closeDrawer } = useDrawerStore();

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && isOpen) closeDrawer();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeDrawer]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40 xl:hidden"
            onClick={closeDrawer}
          />

          {/* Drawer panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 h-dvh z-50 w-full sm:w-[480px]',
              'bg-card border-l border-border/40 shadow-theme-lg',
              'flex flex-col',
              'xl:relative xl:z-auto'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={closeDrawer}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {content}
              </div>
            </ScrollArea>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
