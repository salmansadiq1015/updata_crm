'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useChatRooms } from '@/modules/chat/hooks/use-chat-rooms';
import { queryKeys } from '@/lib/query/keys';
import { getSocket } from '@/lib/socket/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, SquarePen, Users, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatSidebarItem } from './chat-sidebar-item';
import { UserSearchDialog } from './user-search-dialog';
import { CreateGroupDialog } from './create-group-dialog';
import { JoinGroupDialog } from './join-group-dialog';
import { useLanguage } from '@/lib/i18n/language-context';

const FILTERS = [
  { value: 'All', labelKey: 'common.all' },
  { value: 'Direct', labelKey: 'chat.direct' },
  { value: 'Groups', labelKey: 'chat.groups' },
  { value: 'Projects', labelKey: 'common.projects' },
];

function filterRooms(rooms, filter, search) {
  let list = rooms ?? [];
  if (filter === 'Direct') list = list.filter(r => r.roomType === 'DM');
  if (filter === 'Groups') list = list.filter(r => r.roomType === 'GROUP');
  if (filter === 'Projects') list = list.filter(r => r.roomType === 'PROJECT');
  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.lastMessageText || '').toLowerCase().includes(q)
    );
  }
  return list;
}

export function ChatSidebar({ activeRoomId }) {
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const currentUserId = user?._id;
  const { data: rooms, isLoading } = useChatRooms();

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  // Socket: room_updated → invalidate rooms list
  useEffect(() => {
    if (!currentUserId) return;
    const socket = getSocket();
    if (!socket) return;
    const handler = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    socket.on('chat:room_updated', handler);
    return () => socket.off('chat:room_updated', handler);
  }, [currentUserId, queryClient]);

  const visible = filterRooms(rooms, filter, search);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <h2 className="text-lg font-bold tracking-tight">{t('chat.title')}</h2>
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDmOpen(true)}>
                  <SquarePen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('chat.newMessage')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setGroupOpen(true)}>
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('chat.newGroup')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setJoinOpen(true)}>
                  <Hash className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('chat.joinByCode')}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('chat.searchOrStart')}
            className="pl-8 h-8 text-sm bg-muted/50 border-0 focus-visible:ring-1 rounded-full"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'text-xs px-3 py-1 rounded-full shrink-0 font-medium transition-colors',
              filter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {/* Room list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="h-11 w-11 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-40" />
              </div>
            </div>
          ))
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">{t('chat.noConversations')}</p>
        ) : (
          visible.map(room => (
            <ChatSidebarItem
              key={room._id}
              room={room}
              isActive={room._id === activeRoomId}
              currentUserId={currentUserId}
              onClick={() => router.push(`/field-ops/chat?chatId=${room._id}`)}
            />
          ))
        )}
      </ScrollArea>

      {/* Dialogs */}
      <UserSearchDialog open={dmOpen} onClose={() => setDmOpen(false)} />
      <CreateGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
