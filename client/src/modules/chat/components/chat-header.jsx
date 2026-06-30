'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  CalendarPlus,
  CheckSquare,
  Copy,
  FileText,
  LogOut,
  MoreVertical,
  RefreshCw,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePresenceStore } from '@/stores/presence-store';
import {
  getInitials,
  getRoomDisplayName,
  getRoomKindLabel,
  getRoomSubtitle,
  isRoomOnline,
  stableColor,
} from '../utils/chat-room-utils';

export function ChatHeader({
  room,
  currentUserId,
  isBlocked,
  onBlock,
  onUnblock,
  onLeave,
  onDelete,
  onRefreshCode,
  onSearch,
}) {
  const { t } = useLanguage();
  const onlineIds = usePresenceStore((state) => state.onlineIds);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!room) {
    return (
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-border/60 bg-card/90 px-4">
        <Skeleton className="h-11 w-11 rounded-2xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    );
  }

  const isDm = room.roomType === 'DM';
  const isGroup = room.roomType === 'GROUP';
  const isAdmin = isGroup && room.admins?.some((admin) => String(admin._id || admin) === String(currentUserId));
  const displayName = getRoomDisplayName(room, currentUserId, t);
  const subtitle = getRoomSubtitle(room, currentUserId, onlineIds, t);
  const isOnline = isRoomOnline(room, currentUserId, onlineIds);
  const memberAvatars = room.members?.slice(0, 4) ?? [];
  const overflowCount = Math.max(0, (room.members?.length ?? 0) - memberAvatars.length);

  async function handleCopyCode() {
    if (!room.joinCode) return;
    try {
      await navigator.clipboard.writeText(room.joinCode);
      showSuccess(t('chat.joinCodeCopied', 'Join code copied.'));
    } catch (error) {
      showError(error);
    }
  }

  const deleteLabel = isDm ? t('chat.deleteChat', 'Delete Chat') : t('chat.deleteGroup', 'Delete Group');
  const deleteDescription = isDm
    ? t('chat.deleteChatDesc', 'This removes the conversation from your chat list. The other person keeps their copy.')
    : t('chat.deleteGroupDesc', 'This permanently deletes the group and its messages for everyone.');

  return (
    <>
      <div className="flex min-h-[72px] shrink-0 items-center gap-3 border-b border-border/60 bg-card/90 px-4">
        <div className="relative shrink-0">
          <Avatar className="h-11 w-11 rounded-2xl ring-1 ring-border/60">
            <AvatarFallback style={{ backgroundColor: stableColor(displayName) }} className="rounded-2xl text-sm font-semibold text-white">
              {isGroup ? <Users className="h-5 w-5" /> : getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          {isDm && isOnline && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            <Badge variant="secondary" className="hidden shrink-0 rounded-full text-[10px] sm:inline-flex">
              {getRoomKindLabel(room, t)}
            </Badge>
            {isBlocked && (
              <Badge variant="destructive" className="shrink-0 rounded-full text-[10px]">
                {t('chat.blocked', 'Blocked')}
              </Badge>
            )}
          </div>
          <p className={cn('mt-0.5 truncate text-xs', isOnline ? 'text-emerald-500' : 'text-muted-foreground')}>
            {subtitle}
          </p>
        </div>

        {memberAvatars.length > 0 && !isDm && (
          <div className="hidden items-center -space-x-2 lg:flex">
            {memberAvatars.map((member) => {
              const user = member.userId;
              const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || '?';
              return (
                <Avatar key={String(user?._id || member.userId)} className="h-8 w-8 ring-2 ring-card">
                  <AvatarFallback style={{ backgroundColor: stableColor(name) }} className="text-[10px] font-semibold text-white">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
              );
            })}
            {overflowCount > 0 && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card">
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onSearch} aria-label={t('chat.advancedSearch', 'Search conversations')}>
            <Search className="h-4 w-4" />
          </Button>
          <Button asChild variant="ghost" size="icon" className="hidden h-9 w-9 rounded-xl sm:inline-flex" aria-label={t('chat.askAiSummary', 'Ask AI for summary')}>
            <Link href={`/ai?chatRoomId=${room._id}&intent=summary`}>
              <Bot className="h-4 w-4" />
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/tasks?chatRoomId=${room._id}`}>
                  <CheckSquare className="mr-2 h-3.5 w-3.5" />
                  {t('chat.createTaskFromChat', 'Create task')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/scheduling/calendar?chatRoomId=${room._id}`}>
                  <CalendarPlus className="mr-2 h-3.5 w-3.5" />
                  {t('chat.createAppointmentFromChat', 'Schedule appointment')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/documents?chatRoomId=${room._id}`}>
                  <FileText className="mr-2 h-3.5 w-3.5" />
                  {t('chat.openDocuments', 'Open documents')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isDm && (
                <>
                  {isBlocked ? (
                    <DropdownMenuItem onClick={onUnblock}>
                      <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                      {t('chat.unblockUser', 'Unblock User')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={onBlock} className="text-destructive focus:text-destructive">
                      <ShieldBan className="mr-2 h-3.5 w-3.5" />
                      {t('chat.blockUser', 'Block User')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {deleteLabel}
                  </DropdownMenuItem>
                </>
              )}
              {isGroup && (
                <>
                  {room.joinCode && (
                    <DropdownMenuItem onClick={handleCopyCode}>
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      {t('chat.copyJoinCode', 'Copy Join Code')} ({room.joinCode})
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => onRefreshCode?.(room._id)}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      {t('chat.refreshCode', 'Refresh Code')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      {deleteLabel}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onLeave?.(room._id)} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    {t('chat.leaveGroup', 'Leave Group')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleteLabel}?</DialogTitle>
            <DialogDescription>{deleteDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDelete(false);
                onDelete?.(room._id);
              }}
            >
              {deleteLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
