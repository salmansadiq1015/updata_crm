'use client';

import { motion } from 'framer-motion';

export function AiChatTypingIndicator() {
  return (
    <div className="flex gap-1.5 items-center py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-primary"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}
