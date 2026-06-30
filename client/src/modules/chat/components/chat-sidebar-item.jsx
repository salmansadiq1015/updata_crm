'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, BriefcaseBusiness, UserRound, Hash, Building2 } from 'lucide-react';
import { isToday, isThisWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePresenceStore } from '@/stores/presence-store';
import {
  getInitials,
  getOtherMember,
  getRoomDisplayName,
  getRoomKindLabel,
  stableColor,
} from '../utils/chat-room-utils';

function formatTs(date, locale) {
  if (!date) return '';
  const value = new Date(date);
  if (isToday(value)) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(value);
  }
  if (isThisWeek(value)) {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(value);
  }
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(value);
}

function RoomTypeIcon({ room, className }) {
  if (room.roomType === 'DM') return <UserRound className={className} />;
  if (room.roomType === 'PROJECT' || room.roomType === 'ORDER' || room.projectId || room.orderId) {
    return <BriefcaseBusiness className={className} />;
  }
  if (room.roomType === 'TEAM') return <Hash className={className} />;
  if (room.roomType === 'DEPARTMENT') return <Building2 className={className} />;
  return <Users className={className} />;
}

function getPreview(room, t) {
  const source = room.lastMessageText || room.description || '';
  if (!source) return room.roomType === 'DM' ? t('chat.directConversation', 'Direct conversation') : getRoomKindLabel(room, t);
  return source.length > 54 ? `${source.slice(0, 54)}...` : source;
}

export function ChatSidebarItem({ room, isActive, currentUserId, onClick }) {
  const { locale, t } = useLanguage();
  const onlineIds = usePresenceStore((state) => state.onlineIds);
  const displayName = getRoomDisplayName(room, currentUserId, t);
  const timestamp = formatTs(room.lastMessageAt, locale);
  const preview = getPreview(room, t);
  const unread = room.unreadCount ?? 0;
  const isUnread = unread > 0;
  const other = room.roomType === 'DM' ? getOtherMember(room, currentUserId) : null;
  const otherId = String(other?.userId?._id || other?.userId || '');
  const online = otherId ? onlineIds.has(otherId) : false;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full px-2 py-1.5 text-left outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-colors',
          isActive
            ? 'border-primary/45 bg-primary/10 shadow-sm'
            : 'border-transparent hover:border-border/70 hover:bg-muted/45'
        )}
      >
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11 ring-1 ring-border/50">
            <AvatarFallback style={{ backgroundColor: stableColor(displayName) }} className="text-sm font-semibold text-white">
              {room.roomType === 'DM' ? getInitials(displayName) : <RoomTypeIcon room={room} className="h-5 w-5" />}
            </AvatarFallback>
          </Avatar>
          {online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
          {room.roomType !== 'DM' && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-1 ring-border">
              <RoomTypeIcon room={room} className="h-2.5 w-2.5 text-primary" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('truncate text-sm', isUnread || isActive ? 'font-semibold' : 'font-medium')}>
              {displayName}
            </span>
            <span className={cn('shrink-0 text-[11px] tabular-nums', isUnread ? 'font-medium text-primary' : 'text-muted-foreground')}>
              {timestamp}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className={cn('truncate text-xs', isUnread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {preview}
            </span>
            {isUnread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : (
              <Badge variant="secondary" className="hidden shrink-0 rounded-full text-[10px] font-medium group-hover:inline-flex">
                {getRoomKindLabel(room, t)}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
