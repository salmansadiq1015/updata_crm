'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuthStore } from '@/stores/auth-store';
import { useChatRooms } from '@/modules/chat/hooks/use-chat-rooms';
import { queryKeys } from '@/lib/query/keys';
import { getSocket } from '@/lib/socket/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, SquarePen, Users, Hash, MessageSquare, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CHAT_FILTERS } from '../constants/chat-config';
import { filterRooms, getRoomStats } from '../utils/chat-room-utils';
import { ChatSidebarItem } from './chat-sidebar-item';
import { ChatSearchDialog } from './chat-search-dialog';
import { UserSearchDialog } from './user-search-dialog';
import { CreateGroupDialog } from './create-group-dialog';
import { JoinGroupDialog } from './join-group-dialog';

export function ChatSidebar({ activeRoomId, onNavigate }) {
  const { t } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const currentUserId = user?._id;
  const { data: rooms, isLoading } = useChatRooms();

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [dmOpen, setDmOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const parentRef = useRef(null);

  useEffect(() => {
    if (!currentUserId) return;
    const socket = getSocket();
    if (!socket) return;
    const handler = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    socket.on('chat:room_updated', handler);
    return () => socket.off('chat:room_updated', handler);
  }, [currentUserId, queryClient]);

  const stats = useMemo(() => getRoomStats(rooms ?? []), [rooms]);
  const visible = useMemo(
    () => filterRooms(rooms, filter, search, currentUserId, t),
    [rooms, filter, search, currentUserId, t]
  );
  const filterCounts = useMemo(() => ({
    All: stats.total,
    Direct: stats.direct,
    Groups: stats.groups,
    Projects: stats.projects,
    Channels: stats.channels,
  }), [stats]);
  // TanStack Virtual intentionally returns imperative helpers for large-list performance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col bg-card/95">
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight">{t('chat.title')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('chat.activeOverview', '{count} active - {unread} unread', {
                    count: stats.total,
                    unread: stats.unread,
                  })}
                </p>
              </div>
            </div>
          </div>

          <TooltipProvider delayDuration={300}>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    onClick={() => setDmOpen(true)}
                    aria-label={t('chat.newMessage')}
                  >
                    <SquarePen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('chat.newMessage')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    onClick={() => setGroupOpen(true)}
                    aria-label={t('chat.newGroup')}
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('chat.newGroup')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    onClick={() => setJoinOpen(true)}
                    aria-label={t('chat.joinByCode')}
                  >
                    <Hash className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('chat.joinByCode')}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('chat.direct', 'Direct')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{stats.direct}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('chat.groups', 'Groups')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{stats.groups}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/55 px-3 py-2">
            <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('common.projects', 'Projects')}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{stats.projects}</p>
          </div>
        </div>
      </div>

      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('chat.searchOrStart')}
              className="h-9 rounded-2xl border-border/60 bg-muted/40 pl-8 text-sm focus-visible:ring-1"
            />
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-2xl"
            onClick={() => setSearchOpen(true)}
            aria-label={t('chat.advancedSearch', 'Search conversations')}
          >
            <Radio className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2.5 scrollbar-none">
        {CHAT_FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === item.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted'
            )}
          >
            {t(item.labelKey)}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                filter === item.value ? 'bg-primary-foreground/20' : 'bg-background/70'
              )}
            >
              {filterCounts[item.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{t('chat.noConversations')}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('chat.noConversationsHint', 'Start a direct message, group, or project chat.')}
              </p>
            </div>
            <Button size="sm" className="rounded-full" onClick={() => setDmOpen(true)}>
              <SquarePen className="mr-2 h-3.5 w-3.5" />
              {t('chat.newMessage')}
            </Button>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const room = visible[virtualRow.index];
              if (!room) return null;
              return (
                <div
                  key={room._id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ChatSidebarItem
                    room={room}
                    isActive={room._id === activeRoomId}
                    currentUserId={currentUserId}
                    onClick={() => {
                      router.push(`/field-ops/chat?chatId=${room._id}`);
                      onNavigate?.();
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('chat.deliveryStatus', 'Real-time delivery')}</span>
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {t('chat.auditReady', 'Audit ready')}
          </Badge>
        </div>
      </div>

      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        activeRoomId={activeRoomId}
        rooms={rooms ?? []}
        currentUserId={currentUserId}
      />
      <UserSearchDialog open={dmOpen} onClose={() => setDmOpen(false)} />
      <CreateGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
      <JoinGroupDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
