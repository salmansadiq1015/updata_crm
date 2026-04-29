'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/formatters';
import { useLanguage } from '@/lib/i18n';

export function FieldOpsChatMessage({ message, isMine, showSenderName, showTimestamp }) {
  const { t } = useLanguage();
  const senderName = message.sender_name || message.senderName || '?';
  const timestamp = message.created_at || message.createdAt;
  const isDeleted = message.isDeleted || message.is_deleted;

  const initials = senderName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className={cn('flex items-end gap-2 px-4 py-0.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar spacer / avatar */}
      {!isMine ? (
        showSenderName ? (
          <Avatar className="h-7 w-7 shrink-0 mb-0.5">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-7 shrink-0" />
        )
      ) : null}

      {/* Bubble */}
      <div className={cn('max-w-[70%] flex flex-col gap-0.5', isMine ? 'items-end' : 'items-start')}>
        {showSenderName && !isMine && (
          <span className="text-[11px] font-medium text-muted-foreground px-1">
            {senderName}
          </span>
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed break-words',
            isMine
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          )}
        >
          {isDeleted ? (
            <span className="italic opacity-60">
              {t('fieldOps.chat.deleted', 'This message was deleted')}
            </span>
          ) : (
            message.content
          )}

          {showTimestamp && timestamp && (
            <div
              className={cn(
                'text-[10px] mt-1 select-none',
                isMine ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground text-right'
              )}
            >
              {formatDateTime(timestamp)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
