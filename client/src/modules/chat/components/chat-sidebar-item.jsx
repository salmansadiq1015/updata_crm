'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users } from 'lucide-react';
import { format, isToday, isThisWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { usePresenceStore } from '@/stores/presence-store';

// Deterministic color from a string
const COLORS = ['#e53935','#d81b60','#8e24aa','#3949ab','#1e88e5','#00897b','#43a047','#fb8c00','#6d4c41','#546e7a'];
function nameColor(str) {
  if (!str) return COLORS[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function formatTs(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isThisWeek(d)) return format(d, 'EEE');
  return format(d, 'dd/MM/yy');
}

function getDisplayName(room, currentUserId) {
  if (room.roomType === 'DM') {
    const other = room.members?.find(
      (m) => String(m.userId?._id || m.userId) !== String(currentUserId)
    );
    if (other?.userId?.firstName) {
      return `${other.userId.firstName} ${other.userId.lastName ?? ''}`.trim();
    }
    return 'Direct Message';
  }
  if (room.roomType === 'GROUP') return room.name || 'Group';
  if (room.roomType === 'PROJECT') {
    return room.project?.customerName
      ? `${room.project.customerName} · #${room.project.orderNumber}`
      : 'Project Chat';
  }
  return 'Chat';
}

export function ChatSidebarItem({ room, isActive, currentUserId, onClick }) {
  const onlineIds = usePresenceStore((s) => s.onlineIds);
  const displayName = getDisplayName(room, currentUserId);
  const timestamp = formatTs(room.lastMessageAt);
  const preview = room.lastMessageText
    ? room.lastMessageText.slice(0, 42) + (room.lastMessageText.length > 42 ? '…' : '')
    : '';
  const unread = room.unreadCount ?? 0;
  const online = room.roomType === 'DM'
    ? (() => {
        const other = room.members?.find(
          (m) => String(m.userId?._id || m.userId) !== String(currentUserId)
        );
        const otherId = String(other?.userId?._id || other?.userId || '');
        return otherId ? onlineIds.has(otherId) : false;
      })()
    : false;
  const bgColor = nameColor(displayName);
  const initials = displayName.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors',
        'hover:bg-muted/40 border-l-[3px]',
        isActive
          ? 'bg-primary/[0.07] border-l-primary'
          : 'border-l-transparent'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarFallback style={{ backgroundColor: bgColor }} className="text-white font-semibold text-sm">
            {room.roomType === 'GROUP'
              ? <Users className="h-5 w-5" />
              : initials}
          </AvatarFallback>
        </Avatar>
        {online && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#00a884] ring-2 ring-background" />
        )}
        {room.roomType === 'GROUP' && (
          <span className="absolute -bottom-0.5 -right-0.5 bg-primary/80 rounded-full p-0.5">
            <Users className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn('text-sm truncate', isActive ? 'font-bold' : 'font-semibold')}>
            {displayName}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">{timestamp}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{preview || ' '}</span>
          {unread > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 text-[10px] font-semibold rounded-full bg-[#00a884] text-white flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
