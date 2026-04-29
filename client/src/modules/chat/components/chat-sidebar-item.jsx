'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format, isToday, isThisWeek } from 'date-fns';

function formatDateRelative(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isThisWeek(d)) return format(d, 'EEE');
  return format(d, 'dd/MM/yy');
}

function getDisplayName(room, currentUserId) {
  if (room.roomType === 'DM') {
    const other = room.members?.find((m) => m.userId?._id !== currentUserId);
    if (other?.userId) {
      return `${other.userId.firstName} ${other.userId.lastName}`.trim();
    }
    return 'Unknown';
  }
  if (room.roomType === 'PROJECT') {
    if (room.project?.customerName) {
      return `${room.project.customerName} · #${room.project.orderNumber}`;
    }
    return 'Project Chat';
  }
  return 'Chat';
}

function getInitials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function isOnline(room, currentUserId) {
  if (room.roomType !== 'DM') return false;
  const other = room.members?.find((m) => m.userId?._id !== currentUserId);
  return other?.userId?.isOnline ?? false;
}

export function ChatSidebarItem({ room, isActive, currentUserId, onClick }) {
  const displayName = getDisplayName(room, currentUserId);
  const timestamp = formatDateRelative(room.lastMessageAt);
  const preview = room.lastMessageText
    ? room.lastMessageText.slice(0, 40) + (room.lastMessageText.length > 40 ? '…' : '')
    : '';
  const unread = room.unreadCount ?? 0;
  const online = isOnline(room, currentUserId);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
        isActive
          ? 'bg-primary/[0.08] border-l-2 border-l-primary'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
        {online && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-sm truncate">{displayName}</span>
          <span className="text-xs text-muted-foreground shrink-0">{timestamp}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{preview}</span>
          {unread > 0 && (
            <Badge className="shrink-0 h-5 min-w-[20px] px-1.5 text-[10px] rounded-full">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}
