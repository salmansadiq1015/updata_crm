'use client';

import { motion } from 'framer-motion';
import {
  Sparkles, Wrench, CalendarClock, Package, Stamp, BarChart3, ListChecks,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * What the assistant is actually good for, as of the agents that exist.
 *
 * The four it used to offer were all creations — a task, a notification, a
 * customer, an invoice — from before any of the reading agents existed. A new
 * reader saw four ways to write and no hint that they could ask which permits
 * a job needs, whether the material will arrive, or who is free on Tuesday.
 * Reads lead here on purpose: they are safe, and they are where the answers
 * are. Keep this list in step with the agents; it is the only help screen.
 */
const SUGGESTIONS = [
  { key: 'dueMaintenance', icon: Wrench },
  { key: 'whoIsFree', icon: CalendarClock },
  { key: 'materialStatus', icon: Package },
  { key: 'permitsNeeded', icon: Stamp },
  { key: 'projectFigures', icon: BarChart3 },
  { key: 'maintenanceTask', icon: ListChecks },
];

function getGreetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'ai.welcome.goodMorning';
  if (hour < 17) return 'ai.welcome.goodAfternoon';
  return 'ai.welcome.goodEvening';
}

export function AiChatWelcome({ onSuggestionClick }) {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const firstName =
    user?.firstName ||
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    t('ai.welcome.fallbackName');

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-[0.04] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-card shadow-sm"
      >
        <Sparkles className="h-7 w-7 text-primary" />
      </motion.div>

      <div className="text-center space-y-2 relative z-10">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="text-2xl font-bold text-gradient"
        >
          {t(getGreetingKey(), null, { name: firstName })}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="text-muted-foreground text-sm"
        >
          {t('ai.welcome.prompt')}
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg relative z-10"
      >
        {SUGGESTIONS.map(({ key, icon: Icon }) => {
          const label = t(`ai.welcome.suggestion.${key}`);
          // The caption names the intent; the starter text is what lands in
          // the field, for the user to complete before sending.
          const starter = t(`ai.welcome.prompt.${key}`, label);
          return (
            <Button
              key={key}
              variant="outline"
              className="h-auto py-3 px-4 text-left justify-start gap-2.5 text-sm font-normal hover:bg-primary/5 hover:border-primary/30 transition-all"
              onClick={() => onSuggestionClick?.(starter)}
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{label}</span>
            </Button>
          );
        })}
      </motion.div>
    </div>
  );
}
