'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { X } from 'lucide-react';

export function BulkActionsBar({ count, onClear, children }) {
  const { t } = useLanguage();
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="toolbar"
      aria-label={t('common.selectedCountShort', '{count} selected', { count })}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-2xl border border-primary/20 bg-card/95 px-4 py-3 shadow-theme-lg backdrop-blur-xl sm:bottom-6 sm:px-5"
    >
      <span className="text-sm font-semibold text-primary">
        {t('common.selectedCountShort', '{count} selected', { count })}
      </span>
      <div className="hidden h-5 w-px bg-border sm:block" />
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground h-8 rounded-lg">
        <X className="h-3.5 w-3.5" />
        {t('common.clearSelection', 'Clear selection')}
      </Button>
    </motion.div>
  );
}
