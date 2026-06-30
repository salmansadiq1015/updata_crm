'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function ChatReplyPreview({ message, onClear, className }) {
  const { t } = useLanguage();
  if (!message) return null;
  const senderName = message.replyToSenderName || message.senderName || message.sender_name || t('common.unknown', 'Unknown');
  const snippet = message.replyToSnippet || message.content || '';

  return (
    <div className={cn('flex items-start gap-2 px-3 py-2 bg-muted/50 border-l-2 border-l-primary rounded-sm', className)}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary truncate">{senderName}</p>
        <p className="text-xs text-muted-foreground truncate">{snippet.slice(0, 80)}</p>
      </div>
      {onClear && (
        <button onClick={onClear} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
