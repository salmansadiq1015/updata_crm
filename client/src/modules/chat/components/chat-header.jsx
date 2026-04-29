'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, ShieldBan, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function ChatHeader({ room, currentUserId, isBlocked, onBlock, onUnblock }) {
  const { t } = useLanguage();

  if (!room) {
    return (
      <div className="h-[60px] shrink-0 border-b flex items-center px-4 gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
    );
  }

  // Resolve display name and subtitle
  let displayName = '';
  let subtitle = '';
  let isDm = room.roomType === 'DM';

  if (isDm) {
    // Find the other participant (not currentUserId)
    const other = room.members?.find((m) => String(m.userId) !== String(currentUserId));
    displayName = other?.displayName || other?.name || 'Direct Message';
    subtitle = 'Direct Message';
  } else {
    displayName = room.displayName || room.customerName || room.projectName || 'Project Chat';
    subtitle = room.orderNumber ? `#${room.orderNumber}` : 'Project';
  }

  const initials = displayName.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

  return (
    <div className="h-[60px] shrink-0 border-b flex items-center px-4 gap-3">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
        </Avatar>
        {isDm && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{displayName}</span>
          {!isDm && room.orderType && (
            <Badge variant="secondary" className="text-xs shrink-0">{room.orderType}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {isDm && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isBlocked ? (
              <DropdownMenuItem onClick={onUnblock}>
                <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                {t('chat.unblock', 'Unblock User')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onBlock} className="text-destructive focus:text-destructive">
                <ShieldBan className="h-3.5 w-3.5 mr-2" />
                {t('chat.block', 'Block User')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
