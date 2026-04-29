'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, ShieldBan, ShieldCheck, Users, Copy, LogOut, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#e53935','#d81b60','#8e24aa','#3949ab','#1e88e5','#00897b','#43a047','#fb8c00'];
function nameColor(str) {
  if (!str) return COLORS[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function ChatHeader({ room, currentUserId, isBlocked, onBlock, onUnblock, onLeave, onRefreshCode }) {
  if (!room) {
    return (
      <div className="h-16 shrink-0 border-b border-border/40 flex items-center px-4 gap-3 bg-card">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    );
  }

  const isDm = room.roomType === 'DM';
  const isGroup = room.roomType === 'GROUP';

  // Resolve display name
  let displayName = '';
  let subtitle = '';

  if (isDm) {
    const other = room.members?.find(m => String(m.userId?._id || m.userId) !== String(currentUserId));
    displayName = other?.userId?.firstName
      ? `${other.userId.firstName} ${other.userId.lastName ?? ''}`.trim()
      : 'Direct Message';
    const isOnline = other?.userId?.isOnline ?? false;
    subtitle = isOnline ? 'Online' : 'Direct Message';
  } else if (isGroup) {
    displayName = room.name || 'Group';
    const count = room.members?.length ?? 0;
    subtitle = `${count} member${count !== 1 ? 's' : ''}`;
  } else {
    displayName = room.project?.customerName
      ? `${room.project.customerName} · #${room.project.orderNumber}`
      : 'Project Chat';
    subtitle = 'Project';
  }

  const initials = displayName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
  const bgColor = nameColor(displayName);

  // Group: stacked member avatars (up to 3 + overflow)
  const memberAvatars = isGroup ? (room.members ?? []).slice(0, 3) : [];
  const overflowCount = isGroup ? Math.max(0, (room.members?.length ?? 0) - 3) : 0;

  const handleCopyCode = () => {
    if (room.joinCode) {
      navigator.clipboard.writeText(room.joinCode).catch(() => {});
    }
  };

  return (
    <div className="h-16 shrink-0 border-b border-border/40 flex items-center px-4 gap-3 bg-card">
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback style={{ backgroundColor: bgColor }} className="text-white font-semibold text-sm">
            {isGroup ? <Users className="h-5 w-5" /> : initials}
          </AvatarFallback>
        </Avatar>
        {isDm && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#00a884] border-2 border-background" />
        )}
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold truncate">{displayName}</span>
          {!isDm && !isGroup && room.orderType && (
            <Badge variant="secondary" className="text-[10px] shrink-0">{room.orderType}</Badge>
          )}
        </div>
        <p className={cn('text-xs', isDm && subtitle === 'Online' ? 'text-[#00a884]' : 'text-muted-foreground')}>
          {subtitle}
        </p>
      </div>

      {/* GROUP: stacked member avatars */}
      {isGroup && memberAvatars.length > 0 && (
        <div className="hidden sm:flex items-center -space-x-2 mr-1">
          {memberAvatars.map((m, i) => {
            const u = m.userId;
            const name = u?.firstName ? `${u.firstName} ${u.lastName ?? ''}`.trim() : '?';
            const ic = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
            return (
              <Avatar key={i} className="h-7 w-7 ring-2 ring-background">
                <AvatarFallback style={{ backgroundColor: nameColor(name) }} className="text-white text-[10px] font-semibold">
                  {ic}
                </AvatarFallback>
              </Avatar>
            );
          })}
          {overflowCount > 0 && (
            <div className="h-7 w-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
              +{overflowCount}
            </div>
          )}
        </div>
      )}

      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {isDm && (
            <>
              {isBlocked ? (
                <DropdownMenuItem onClick={onUnblock}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                  Unblock User
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onBlock} className="text-destructive focus:text-destructive">
                  <ShieldBan className="h-3.5 w-3.5 mr-2" />
                  Block User
                </DropdownMenuItem>
              )}
            </>
          )}
          {isGroup && (
            <>
              {room.joinCode && (
                <DropdownMenuItem onClick={handleCopyCode}>
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Copy Join Code ({room.joinCode})
                </DropdownMenuItem>
              )}
              {room.admins?.some(a => String(a._id || a) === String(currentUserId)) && (
                <DropdownMenuItem onClick={() => onRefreshCode?.(room._id)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Refresh Code
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onLeave?.(room._id)} className="text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5 mr-2" />
                Leave Group
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
