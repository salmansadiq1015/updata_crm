'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function ChatTypingIndicator({ typingUsers = [] }) {
  const { t } = useLanguage();
  const count = typingUsers.length;

  let label = '';
  if (count === 1) {
    const name = typingUsers[0]?.userName ?? String(typingUsers[0]);
    label = t('chat.typingSingle', '{name} is typing...', { name });
  } else if (count > 1) {
    label = t('chat.typingMultiple', 'Several people are typing...');
  }

  return (
    <div className={cn('overflow-hidden transition-all duration-200 px-4', count > 0 ? 'max-h-8 py-1' : 'max-h-0 py-0')}>
      <div className="flex items-center gap-2">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
