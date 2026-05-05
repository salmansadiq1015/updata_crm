'use client';

import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';

const SUGGESTIONS = [
  { label: 'Create a maintenance task', emoji: '🔧' },
  { label: 'Send a notification to the team', emoji: '🔔' },
  { label: 'Create a lead for a new customer', emoji: '👤' },
  { label: 'Generate an invoice', emoji: '📄' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AiChatWelcome({ onSuggestionClick }) {
  const user = useAuthStore((s) => s.user);
  const firstName =
    user?.firstName ||
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there';

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-8 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-[0.04] pointer-events-none" />

      {/* Animated orb */}
      <motion.div
        className="relative"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      >
        <motion.div
          className="h-20 w-20 rounded-full bg-primary-gradient shadow-2xl"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-full bg-primary-gradient opacity-25 blur-xl"
          animate={{ scale: [1, 1.5, 1] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut', delay: 0.15 }}
        />
      </motion.div>

      {/* Greeting */}
      <div className="text-center space-y-2 relative z-10">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="text-2xl font-bold text-gradient"
        >
          {`${getGreeting()}, ${firstName}`}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="text-muted-foreground text-sm"
        >
          What can I help you with today?
        </motion.p>
      </div>

      {/* Suggestion chips */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.35 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg relative z-10"
      >
        {SUGGESTIONS.map(({ label, emoji }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto py-3 px-4 text-left justify-start gap-2.5 text-sm font-normal hover:bg-primary/5 hover:border-primary/30 transition-all"
            onClick={() => onSuggestionClick?.(label)}
          >
            <span className="text-base">{emoji}</span>
            <span className="truncate">{label}</span>
          </Button>
        ))}
      </motion.div>
    </div>
  );
}
