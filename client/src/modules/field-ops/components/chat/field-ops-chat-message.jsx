'use client';

import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/use-auth';

export function FieldOpsChatMessage({ message }) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?._id || message.senderId === user?._id;
  const time = new Date(message.sent_at || message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex gap-2 mb-3', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine && (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
          {(message.sender_name || message.senderName || '?')[0].toUpperCase()}
        </div>
      )}
      <div className="max-w-[72%] space-y-0.5">
        {!isMine && (
          <p className="text-[11px] font-medium text-muted-foreground px-1">{message.sender_name || message.senderName}</p>
        )}
        <div className={cn(
          'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
          isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
        )}>
          {message.content}
        </div>
        <p className={cn('text-[10px] text-muted-foreground px-1', isMine && 'text-right')}>{time}</p>
      </div>
    </div>
  );
}
