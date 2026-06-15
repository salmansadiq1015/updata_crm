'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function BulkActionsBar({ count, onClear, children }) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-primary/20 bg-card shadow-theme-lg px-5 py-3 backdrop-blur-md"
    >
      <span className="text-sm font-semibold text-primary">
        {count} ausgewählt
      </span>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground h-8 rounded-lg">
        <X className="h-3.5 w-3.5" />
        Aufheben
      </Button>
    </motion.div>
  );
}
